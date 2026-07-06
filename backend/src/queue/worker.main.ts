import 'reflect-metadata';
import { Worker, Queue, QueueEvents } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnection } from './redis-connection';
import { QUEUE_NAMES } from './queue.service';
import { MetaAdapter } from '../integrations/adapters/meta.adapter';
import { GoogleAdsAdapter } from '../integrations/adapters/google-ads.adapter';
import { TikTokAdsAdapter } from '../integrations/adapters/tiktok-ads.adapter';
import { EncryptionService } from '../common/encryption.service';
import { SyncContext } from '../integrations/adapter.interface';
import { processPostbackEvent } from './handlers/postback-processor';
import { evaluateEvent } from './handlers/automation-evaluator';
import { runForecast } from './handlers/forecast-runner';
import { runAnomalyScan } from './handlers/anomaly-scanner';

/**
 * Runs as its own process (`npm run worker`), separate from the API server,
 * so a slow sync job never blocks request handling. Each queue gets a
 * Worker; failures beyond the retry budget land in BullMQ's built-in
 * failed-jobs set, which doubles as the dead-letter queue — inspect with
 * `queue.getFailed()` or a tool like Bull Board / Taskforce.
 */
const prisma = new PrismaClient();
const encryption = new EncryptionService();
const syncCtx: SyncContext = {
  prisma,
  decrypt: (c) => encryption.decrypt(c),
  encrypt: (p) => encryption.encrypt(p),
};
const adapters: Record<string, any> = {
  META_ADS: new MetaAdapter(),
  GOOGLE_ADS: new GoogleAdsAdapter(),
  TIKTOK_ADS: new TikTokAdsAdapter(),
};
const automationQueue = new Queue(QUEUE_NAMES.AUTOMATION_EVALUATION, { connection: redisConnection });

new Worker(
  QUEUE_NAMES.SYNC,
  async (job) => {
    const { integrationAccountId, provider } = job.data;
    const adapter = adapters[provider];
    if (!adapter) throw new Error(`No sync adapter registered for provider "${provider}"`);
    if (job.name === 'daily-sync') await adapter.syncDaily(integrationAccountId, syncCtx);
    if (job.name === 'historical-sync') await adapter.syncHistorical(integrationAccountId, new Date(job.data.sinceDate), syncCtx);
  },
  { connection: redisConnection },
);

new Worker(
  QUEUE_NAMES.TOKEN_REFRESH,
  async (job) => {
    const account = await prisma.integrationAccount.findUnique({ where: { id: job.data.integrationAccountId } });
    if (!account) return;
    if (account.provider === 'TIKTOK_ADS') return; // long-lived token, no refresh cycle — re-auth instead if revoked
    const adapter = adapters[account.provider];
    if (!adapter?.refreshAccessToken) return;
    if (!account.refreshTokenEnc) throw new Error(`IntegrationAccount ${account.id} has no refresh token stored.`);

    try {
      const refreshToken = encryption.decrypt(account.refreshTokenEnc);
      const result = await adapter.refreshAccessToken(refreshToken);
      await prisma.integrationAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encryption.encrypt(result.accessToken),
          ...(result.refreshToken ? { refreshTokenEnc: encryption.encrypt(result.refreshToken) } : {}),
          tokenExpiresAt: result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : account.tokenExpiresAt,
          status: 'CONNECTED',
        },
      });
    } catch (err) {
      await prisma.integrationAccount.update({ where: { id: account.id }, data: { status: 'TOKEN_EXPIRED' } });
      throw err;
    }
  },
  { connection: redisConnection },
);

new Worker(
  QUEUE_NAMES.WEBHOOK_PROCESSING,
  async (job) => {
    const event = await prisma.webhookEvent.findUnique({ where: { id: job.data.webhookEventId } });
    if (!event) return;
    // TODO: route by event.provider to provider-specific handlers that
    // upsert Campaign/AdSet/Ad rows from the webhook payload.
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
  },
  { connection: redisConnection },
);

new Worker(
  QUEUE_NAMES.POSTBACK_PROCESSING,
  async (job) => {
    const event = await prisma.webhookEvent.findUnique({ where: { id: job.data.webhookEventId } });
    if (!event) return;
    await processPostbackEvent(event, prisma, automationQueue);
  },
  { connection: redisConnection },
);

new Worker(
  QUEUE_NAMES.AUTOMATION_EVALUATION,
  async (job) => {
    const event = await prisma.event.findUnique({ where: { id: job.data.eventId } });
    if (!event) return;
    await evaluateEvent(event, prisma);
  },
  { connection: redisConnection },
);

new Worker(
  QUEUE_NAMES.AI,
  async (job) => {
    if (job.name === 'forecast') {
      await runForecast(job.data.campaignId, prisma);
    }
    if (job.name === 'anomaly-scan') {
      await runAnomalyScan(job.data.campaignId, prisma);
    }
  },
  { connection: redisConnection },
);

new Worker(
  QUEUE_NAMES.EXPORTS,
  async (job) => {
    // TODO: route job.data.destination ('google-sheets' | 'looker-studio' | 'power-bi')
    // to the matching export connector.
  },
  { connection: redisConnection },
);

for (const name of Object.values(QUEUE_NAMES)) {
  const events = new QueueEvents(name, { connection: redisConnection });
  events.on('failed', ({ jobId, failedReason }) => {
    console.error(`[${name}] job ${jobId} failed permanently: ${failedReason}`);
  });
}

console.log('GoGo Bid background workers running.');
