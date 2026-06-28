import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisConnection } from './redis-connection';

export const QUEUE_NAMES = {
  SYNC: 'sync',
  TOKEN_REFRESH: 'token-refresh',
  WEBHOOK_PROCESSING: 'webhook-processing',
  POSTBACK_PROCESSING: 'postback-processing',
  AI: 'ai',
  EXPORTS: 'exports',
  AUTOMATION_EVALUATION: 'automation-evaluation',
} as const;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues: Record<string, Queue>;

  constructor() {
    this.queues = Object.fromEntries(
      Object.values(QUEUE_NAMES).map((name) => [name, new Queue(name, { connection: redisConnection })]),
    );
  }

  async onModuleDestroy() {
    await Promise.all(Object.values(this.queues).map((q) => q.close()));
  }

  enqueueDailySync(integrationAccountId: string, provider: string) {
    return this.queues[QUEUE_NAMES.SYNC].add('daily-sync', { integrationAccountId, provider }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
    });
  }

  enqueueHistoricalSync(integrationAccountId: string, provider: string, sinceDate: string) {
    return this.queues[QUEUE_NAMES.SYNC].add('historical-sync', { integrationAccountId, provider, sinceDate }, {
      attempts: 3,
    });
  }

  enqueueTokenRefresh(integrationAccountId: string) {
    return this.queues[QUEUE_NAMES.TOKEN_REFRESH].add('refresh', { integrationAccountId }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 },
    });
  }

  enqueueWebhookProcessing(webhookEventId: string) {
    return this.queues[QUEUE_NAMES.WEBHOOK_PROCESSING].add('process', { webhookEventId }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
    });
  }

  enqueuePostbackProcessing(webhookEventId: string) {
    return this.queues[QUEUE_NAMES.POSTBACK_PROCESSING].add('process', { webhookEventId }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
    });
  }

  enqueueForecast(campaignId: string) {
    return this.queues[QUEUE_NAMES.AI].add('forecast', { campaignId }, { attempts: 3 });
  }

  enqueueAnomalyScan(campaignId: string) {
    return this.queues[QUEUE_NAMES.AI].add('anomaly-scan', { campaignId }, { attempts: 3 });
  }

  enqueueExport(campaignId: string, destination: string) {
    return this.queues[QUEUE_NAMES.EXPORTS].add('export', { campaignId, destination }, { attempts: 3 });
  }

  enqueueAutomationEvaluation(eventId: string) {
    return this.queues[QUEUE_NAMES.AUTOMATION_EVALUATION].add('evaluate', { eventId }, { attempts: 3 });
  }
}
