import type { PrismaClient, WebhookEvent } from '@prisma/client';
import { normalizeWebhook, WebhookEntityChange } from '../../webhooks/webhook-normalizer';

/**
 * Turns a verified inbound ad-platform WebhookEvent (Meta/TikTok campaign,
 * ad-set, or ad change) into upserted Campaign/AdSet/Ad rows.
 *
 * Ownership is resolved via the IntegrationAccount matching the payload's
 * account id — that's what ties a foreign platform id to one of our orgs.
 * A change whose account/parent can't be resolved is recorded as a
 * non-fatal skip (the event is still marked PROCESSED as long as at least
 * one change applied, or there was simply nothing to do); an event where
 * every change failed to resolve is marked FAILED so it surfaces rather
 * than silently vanishing.
 *
 * Same plain-function-takes-prisma shape as the postback/automation/AI
 * handlers, so it runs identically in the worker and in tests.
 */
export async function processWebhookEvent(event: WebhookEvent, prisma: PrismaClient): Promise<void> {
  const changes = normalizeWebhook(event.provider, event.payload);

  if (changes.length === 0) {
    // Unrecognized/empty payload — nothing to apply, but not an error.
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
    return;
  }

  let applied = 0;
  const skips: string[] = [];

  for (const ch of changes) {
    const account = await resolveAccount(prisma, event.provider, ch.accountExternalId);
    if (!account) {
      skips.push(`${ch.kind} ${ch.externalId}: no connected account for "${ch.accountExternalId}"`);
      continue;
    }
    try {
      if (ch.kind === 'campaign') {
        await upsertCampaign(prisma, account.organizationId, account.id, ch);
        applied++;
      } else if (ch.kind === 'adset') {
        const ok = await upsertAdSet(prisma, account.id, ch);
        ok ? applied++ : skips.push(`adset ${ch.externalId}: parent campaign "${ch.campaignExternalId}" not found`);
      } else if (ch.kind === 'ad') {
        const ok = await upsertAd(prisma, account.id, ch);
        ok ? applied++ : skips.push(`ad ${ch.externalId}: parent adset "${ch.adsetExternalId}" not found`);
      }
    } catch (err: any) {
      skips.push(`${ch.kind} ${ch.externalId}: ${err.message}`);
    }
  }

  // If nothing applied and we had changes to apply, the event genuinely
  // failed (bad account mapping etc.) — keep it visible as FAILED.
  const failed = applied === 0 && changes.length > 0;
  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      status: failed ? 'FAILED' : 'PROCESSED',
      processedAt: new Date(),
      attempts: { increment: 1 },
      lastError: skips.length ? skips.join('; ').slice(0, 1000) : null,
    },
  });
}

/**
 * Resolve the IntegrationAccount for a webhook. Meta account ids arrive as
 * "act_123456" but may be stored either with or without the prefix, so we try
 * both forms.
 */
async function resolveAccount(prisma: PrismaClient, provider: WebhookEvent['provider'], accountExternalId: string) {
  const candidates = [accountExternalId];
  if (accountExternalId.startsWith('act_')) candidates.push(accountExternalId.slice(4));
  else candidates.push(`act_${accountExternalId}`);
  return prisma.integrationAccount.findFirst({
    where: { provider, externalAccountId: { in: candidates } },
    select: { id: true, organizationId: true },
  });
}

async function upsertCampaign(prisma: PrismaClient, organizationId: string, integrationAccountId: string, ch: WebhookEntityChange) {
  // Campaign has no externalId column — the platform id lives in the `data`
  // JSON blob (data.externalId), matched via a JSON path filter.
  const existing = await prisma.campaign.findFirst({
    where: { integrationAccountId, data: { path: ['externalId'], equals: ch.externalId } },
  });
  const data = { ...((existing?.data as any) || {}), externalId: ch.externalId, source: 'webhook' };
  if (existing) {
    await prisma.campaign.update({
      where: { id: existing.id },
      data: { ...(ch.name ? { name: ch.name } : {}), ...(ch.status ? { status: ch.status } : {}), data },
    });
  } else {
    await prisma.campaign.create({
      data: { organizationId, integrationAccountId, name: ch.name || `Campaign ${ch.externalId}`, status: ch.status || 'active', data },
    });
  }
}

/** Returns false if the parent campaign for this ad-set isn't known yet. */
async function upsertAdSet(prisma: PrismaClient, integrationAccountId: string, ch: WebhookEntityChange): Promise<boolean> {
  if (!ch.campaignExternalId) return false;
  const campaign = await prisma.campaign.findFirst({
    where: { integrationAccountId, data: { path: ['externalId'], equals: ch.campaignExternalId } },
    select: { id: true },
  });
  if (!campaign) return false;
  const existing = await prisma.adSet.findFirst({ where: { campaignId: campaign.id, externalId: ch.externalId } });
  if (existing) {
    if (ch.name) await prisma.adSet.update({ where: { id: existing.id }, data: { name: ch.name } });
  } else {
    await prisma.adSet.create({ data: { campaignId: campaign.id, externalId: ch.externalId, name: ch.name || `Ad Set ${ch.externalId}` } });
  }
  return true;
}

/** Returns false if the parent ad-set for this ad isn't known yet. */
async function upsertAd(prisma: PrismaClient, integrationAccountId: string, ch: WebhookEntityChange): Promise<boolean> {
  if (!ch.adsetExternalId) return false;
  const adset = await prisma.adSet.findFirst({
    where: { externalId: ch.adsetExternalId, campaign: { integrationAccountId } },
    select: { id: true },
  });
  if (!adset) return false;
  const existing = await prisma.ad.findFirst({ where: { adSetId: adset.id, externalId: ch.externalId } });
  if (existing) {
    if (ch.name) await prisma.ad.update({ where: { id: existing.id }, data: { name: ch.name } });
  } else {
    await prisma.ad.create({ data: { adSetId: adset.id, externalId: ch.externalId, name: ch.name || `Ad ${ch.externalId}` } });
  }
  return true;
}
