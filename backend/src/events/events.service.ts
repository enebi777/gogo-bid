import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

/**
 * Single entry point for "something happened" inside the app. Writes the
 * Event row (the audit trail / event log) and enqueues automation
 * evaluation in the same call, so callers never emit one without the other.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async emit(params: { organizationId: string; type: string; campaignId?: string; payload: Record<string, unknown> }) {
    const event = await this.prisma.event.create({
      data: {
        organizationId: params.organizationId,
        type: params.type,
        campaignId: params.campaignId,
        payload: params.payload as any,
      },
    });
    await this.queue.enqueueAutomationEvaluation(event.id);
    return event;
  }
}
