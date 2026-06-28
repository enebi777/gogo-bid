import type { PrismaClient, WebhookEvent } from '@prisma/client';
import { GenericTrackerAdapter } from '../../integrations/adapters/tracker.adapter';

const trackerAdapter = new GenericTrackerAdapter();

/** Minimal shape of a BullMQ Queue we need — kept narrow so tests can pass a plain mock. */
export interface AutomationQueueLike {
  add(name: string, data: Record<string, unknown>): Promise<unknown>;
}

/**
 * Turns a received postback WebhookEvent into a Conversion row.
 *
 * Most trackers only send a clickId on the conversion postback (the click
 * itself was already recorded earlier, e.g. via a redirect pixel), so we
 * resolve the campaign by looking up the matching Click row first. Some
 * postback URLs are configured to also pass the destination campaign id
 * directly (`campaign_id` macro) — used as a fallback when no Click exists
 * yet (e.g. the click-tracking pixel never fired, or this is a test postback).
 *
 * If neither resolves to a real campaign, there's nothing useful to persist
 * — that's a permanent failure (retrying won't make the click materialize),
 * so we mark the event FAILED and return rather than throwing, which would
 * otherwise make BullMQ retry it forever.
 *
 * `automationQueue` is optional so existing callers/tests that don't care
 * about automation keep working — pass the real automation-evaluation
 * Queue in production to fire `conversion.received` for the rule engine.
 */
export async function processPostbackEvent(
  event: WebhookEvent,
  prisma: PrismaClient,
  automationQueue?: AutomationQueueLike,
): Promise<void> {
  const tracker = event.provider.toLowerCase();
  const payload = event.payload as Record<string, unknown>;
  const normalized = trackerAdapter.normalize(tracker, payload);

  let campaignId: string | undefined;

  if (normalized.clickId) {
    const click = await prisma.click.findUnique({
      where: { tracker_clickId: { tracker: event.provider, clickId: normalized.clickId } },
    });
    campaignId = click?.campaignId;
  }

  if (!campaignId && normalized.campaignExternalId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: normalized.campaignExternalId } });
    campaignId = campaign?.id;
  }

  if (!campaignId) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastError: `Could not resolve a campaign (clickId=${normalized.clickId || 'n/a'}, campaignExternalId=${normalized.campaignExternalId || 'n/a'})`,
      },
    });
    return;
  }

  if (normalized.conversionId) {
    await prisma.conversion.upsert({
      where: { tracker_conversionId: { tracker: event.provider, conversionId: normalized.conversionId } },
      create: {
        campaignId,
        tracker: event.provider,
        clickId: normalized.clickId || null,
        conversionId: normalized.conversionId,
        revenue: normalized.revenue,
        payout: normalized.payout,
      },
      update: {
        revenue: normalized.revenue,
        payout: normalized.payout,
      },
    });

    if (automationQueue) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { organizationId: true } });
      if (campaign) {
        const automationEvent = await prisma.event.create({
          data: {
            organizationId: campaign.organizationId,
            type: 'conversion.received',
            campaignId,
            payload: { tracker: event.provider, conversionId: normalized.conversionId, revenue: normalized.revenue, payout: normalized.payout },
          },
        });
        await automationQueue.add('evaluate', { eventId: automationEvent.id });
      }
    }
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 } },
  });
}
