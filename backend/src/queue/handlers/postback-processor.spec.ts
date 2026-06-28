import { processPostbackEvent } from './postback-processor';
import type { WebhookEvent } from '@prisma/client';

function makeEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 'event-1',
    provider: 'VOLUUM' as any,
    externalId: 'conv-1',
    signatureValid: true,
    payload: { cid: 'click-1', txid: 'conv-1', revenue: '49.99', payout: '12.50' },
    status: 'RECEIVED' as any,
    attempts: 0,
    lastError: null,
    receivedAt: new Date(),
    processedAt: null,
    ...overrides,
  };
}

function makePrisma() {
  return {
    click: { findUnique: jest.fn() },
    campaign: { findUnique: jest.fn() },
    conversion: { upsert: jest.fn() },
    webhookEvent: { update: jest.fn() },
  };
}

describe('processPostbackEvent', () => {
  it('resolves the campaign via an existing Click row and creates a Conversion', async () => {
    const prisma = makePrisma();
    prisma.click.findUnique.mockResolvedValue({ id: 'click-row-1', campaignId: 'campaign-1' });

    await processPostbackEvent(makeEvent(), prisma as any);

    expect(prisma.click.findUnique).toHaveBeenCalledWith({
      where: { tracker_clickId: { tracker: 'VOLUUM', clickId: 'click-1' } },
    });
    expect(prisma.conversion.upsert).toHaveBeenCalledWith({
      where: { tracker_conversionId: { tracker: 'VOLUUM', conversionId: 'conv-1' } },
      create: expect.objectContaining({ campaignId: 'campaign-1', clickId: 'click-1', conversionId: 'conv-1', revenue: 49.99, payout: 12.5 }),
      update: expect.objectContaining({ revenue: 49.99, payout: 12.5 }),
    });
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { status: 'PROCESSED', processedAt: expect.any(Date), attempts: { increment: 1 } },
    });
  });

  it('falls back to campaignExternalId when no Click row matches', async () => {
    const prisma = makePrisma();
    prisma.click.findUnique.mockResolvedValue(null);
    prisma.campaign.findUnique.mockResolvedValue({ id: 'campaign-from-macro' });

    await processPostbackEvent(
      makeEvent({ payload: { cid: 'click-1', txid: 'conv-1', campaign_id: 'campaign-from-macro' } }),
      prisma as any,
    );

    expect(prisma.campaign.findUnique).toHaveBeenCalledWith({ where: { id: 'campaign-from-macro' } });
    expect(prisma.conversion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ campaignId: 'campaign-from-macro' }) }),
    );
  });

  it('marks the event FAILED (not thrown) when no campaign can be resolved', async () => {
    const prisma = makePrisma();
    prisma.click.findUnique.mockResolvedValue(null);

    await expect(processPostbackEvent(makeEvent(), prisma as any)).resolves.toBeUndefined();

    expect(prisma.conversion.upsert).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({ status: 'FAILED', attempts: { increment: 1 }, lastError: expect.stringContaining('Could not resolve') }),
    });
  });

  it('skips Conversion creation (but still marks PROCESSED) when there is no conversionId at all', async () => {
    const prisma = makePrisma();
    prisma.click.findUnique.mockResolvedValue({ id: 'click-row-1', campaignId: 'campaign-1' });

    await processPostbackEvent(makeEvent({ payload: { cid: 'click-1' } }), prisma as any);

    expect(prisma.conversion.upsert).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });
});
