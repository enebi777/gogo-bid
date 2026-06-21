import { Controller, Get, Post, Param, Query, Body, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenericTrackerAdapter, TRACKER_FIELD_MAP } from '../integrations/adapters/tracker.adapter';
import { QueueService } from '../queue/queue.service';

const SUPPORTED_TRACKERS = Object.keys(TRACKER_FIELD_MAP);

/**
 * Universal postback receiver: /postback/{tracker}
 * Accepts both GET (most trackers fire postbacks as a simple pixel GET)
 * and POST (JSON body), validates the shared-secret query param, dedupes
 * by (tracker, conversionId), and queues async processing instead of
 * writing inline — keeps this endpoint fast and retry-safe.
 */
@Controller('postback')
export class PostbackController {
  private readonly logger = new Logger(PostbackController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracker: GenericTrackerAdapter,
    private readonly queue: QueueService,
  ) {}

  @Get(':tracker')
  receiveGet(@Param('tracker') tracker: string, @Query() query: Record<string, string>) {
    return this.handle(tracker, query);
  }

  @Post(':tracker')
  receivePost(@Param('tracker') tracker: string, @Body() body: Record<string, unknown>, @Query() query: Record<string, string>) {
    return this.handle(tracker, { ...query, ...body });
  }

  private async handle(tracker: string, payload: Record<string, unknown>) {
    if (!SUPPORTED_TRACKERS.includes(tracker)) {
      throw new BadRequestException(`Unknown tracker "${tracker}". Supported: ${SUPPORTED_TRACKERS.join(', ')}`);
    }
    if (!this.tracker.verifySignature(payload)) {
      throw new BadRequestException('Invalid or missing postback secret.');
    }

    const normalized = this.tracker.normalize(payload);
    if (!normalized.conversionId && !normalized.clickId) {
      throw new BadRequestException('Postback missing both clickId and conversionId — nothing to record.');
    }

    // Dedup happens against WebhookEvent's unique (provider, externalId) constraint.
    const dedupeKey = normalized.conversionId || normalized.clickId;
    const existing = await this.prisma.webhookEvent.findFirst({
      where: { externalId: dedupeKey, provider: this.providerEnum(tracker) },
    });
    if (existing) {
      this.logger.log(`Duplicate postback ignored: ${tracker}/${dedupeKey}`);
      return { status: 'duplicate_ignored' };
    }

    const event = await this.prisma.webhookEvent.create({
      data: {
        provider: this.providerEnum(tracker),
        externalId: dedupeKey,
        signatureValid: true,
        payload: payload as any,
        status: 'RECEIVED',
      },
    });

    await this.queue.enqueuePostbackProcessing(event.id);
    return { status: 'accepted', eventId: event.id };
  }

  private providerEnum(tracker: string) {
    return tracker.toUpperCase() as any; // matches IntegrationProvider enum values (VOLUUM, REDTRACK, ...)
  }
}
