import { processWebhookEvent } from './webhook-processor';
import type { WebhookEvent } from '@prisma/client';

function makeEvent(payload: any, provider: WebhookEvent['provider'] = 'META_ADS'): WebhookEvent {
  return {
    id: 'wh1',
    provider,
    externalId: null,
    signatureValid: true,
    payload,
    status: 'RECEIVED',
    attempts: 0,
    lastError: null,
    receivedAt: new Date(),
    processedAt: null,
  } as WebhookEvent;
}

function makePrisma(over: any = {}) {
  return {
    integrationAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'ia1', organizationId: 'org1' }) },
    campaign: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'camp1' }), update: jest.fn().mockResolvedValue({}) },
    adSet: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'as1' }), update: jest.fn().mockResolvedValue({}) },
    ad: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'ad1' }), update: jest.fn().mockResolvedValue({}) },
    webhookEvent: { update: jest.fn().mockResolvedValue({}) },
    ...over,
  } as any;
}

const campaignPayload = { entry: [{ id: 'act_123', changes: [{ field: 'campaign', value: { campaign_id: 'c1', name: 'Summer', status: 'ACTIVE' } }] }] };

describe('processWebhookEvent', () => {
  it('marks PROCESSED with nothing applied for an unrecognized payload', async () => {
    const prisma = makePrisma();
    await processWebhookEvent(makeEvent({ foo: 'bar' }), prisma);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({ where: { id: 'wh1' }, data: { status: 'PROCESSED', processedAt: expect.any(Date) } });
  });

  it('creates a new campaign when none exists', async () => {
    const prisma = makePrisma();
    await processWebhookEvent(makeEvent(campaignPayload), prisma);
    expect(prisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org1', integrationAccountId: 'ia1', name: 'Summer', status: 'active', data: expect.objectContaining({ externalId: 'c1', source: 'webhook' }) }) }),
    );
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }));
  });

  it('updates an existing campaign matched by data.externalId', async () => {
    const prisma = makePrisma();
    prisma.campaign.findFirst.mockResolvedValue({ id: 'campX', data: { externalId: 'c1', foo: 1 } });
    await processWebhookEvent(makeEvent(campaignPayload), prisma);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'campX' }, data: expect.objectContaining({ name: 'Summer', status: 'active', data: expect.objectContaining({ externalId: 'c1', foo: 1, source: 'webhook' }) }) }),
    );
  });

  it('resolves account by stripping the act_ prefix when needed', async () => {
    const prisma = makePrisma();
    await processWebhookEvent(makeEvent(campaignPayload), prisma);
    expect(prisma.integrationAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ provider: 'META_ADS', externalAccountId: { in: ['act_123', '123'] } }) }),
    );
  });

  it('marks FAILED when no account maps to the payload', async () => {
    const prisma = makePrisma();
    prisma.integrationAccount.findFirst.mockResolvedValue(null);
    await processWebhookEvent(makeEvent(campaignPayload), prisma);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lastError: expect.stringContaining('no connected account') }) }),
    );
  });

  it('skips an orphan ad-set whose parent campaign is unknown (and marks FAILED as the only change)', async () => {
    const prisma = makePrisma();
    prisma.campaign.findFirst.mockResolvedValue(null); // parent campaign not found
    const payload = { entry: [{ id: 'act_123', changes: [{ field: 'adset', value: { adset_id: 'as1', campaign_id: 'cX', name: 'AS' } }] }] };
    await processWebhookEvent(makeEvent(payload), prisma);
    expect(prisma.adSet.create).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lastError: expect.stringContaining('parent campaign') }) }),
    );
  });

  it('applies a campaign then its ad-set in one event', async () => {
    const prisma = makePrisma();
    // campaign findFirst: first (upsertCampaign) → none; second (upsertAdSet parent lookup) → found
    prisma.campaign.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'camp1' });
    const payload = { entry: [{ id: 'act_123', changes: [
      { field: 'campaign', value: { campaign_id: 'c1', name: 'C', status: 'ACTIVE' } },
      { field: 'adset', value: { adset_id: 'as1', campaign_id: 'c1', name: 'AS' } },
    ] }] };
    await processWebhookEvent(makeEvent(payload), prisma);
    expect(prisma.campaign.create).toHaveBeenCalledTimes(1);
    expect(prisma.adSet.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ campaignId: 'camp1', externalId: 'as1', name: 'AS' }) }));
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }));
  });
});
