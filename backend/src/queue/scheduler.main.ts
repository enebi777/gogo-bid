import 'reflect-metadata';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnection } from './redis-connection';
import { QUEUE_NAMES } from './queue.service';

/**
 * Run once (e.g. via `npm run scheduler` on container start, or a system
 * cron hitting it daily) to register BullMQ repeatable jobs — one daily
 * sync per CONNECTED IntegrationAccount, plus a daily token-refresh sweep
 * for accounts whose token expires within 24h.
 *
 * This intentionally runs as a separate small script rather than living
 * inside the long-running worker process, so re-running it to pick up
 * newly-connected accounts doesn't require restarting the workers.
 */
async function main() {
  const prisma = new PrismaClient();
  const syncQueue = new Queue(QUEUE_NAMES.SYNC, { connection: redisConnection });
  const refreshQueue = new Queue(QUEUE_NAMES.TOKEN_REFRESH, { connection: redisConnection });

  const accounts = await prisma.integrationAccount.findMany({ where: { status: 'CONNECTED' } });

  for (const account of accounts) {
    await syncQueue.add(
      'daily-sync',
      { integrationAccountId: account.id, provider: account.provider },
      { repeat: { pattern: '0 6 * * *' }, jobId: `daily-sync:${account.id}` }, // 06:00 UTC daily
    );

    if (account.tokenExpiresAt) {
      await refreshQueue.add(
        'refresh',
        { integrationAccountId: account.id },
        { repeat: { pattern: '0 */6 * * *' }, jobId: `token-refresh:${account.id}` }, // every 6h
      );
    }
  }

  console.log(`Scheduled daily sync + token refresh for ${accounts.length} connected accounts.`);
  await syncQueue.close();
  await refreshQueue.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Scheduler failed:', err);
  process.exit(1);
});
