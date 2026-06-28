import { evaluateEvent } from './automation-evaluator';
import type { Event } from '@prisma/client';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    organizationId: 'org-1',
    campaignId: 'campaign-1',
    type: 'campaign.created',
    payload: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    automationRule: { findMany: jest.fn() },
    automationExecution: { create: jest.fn() },
    campaign: { update: jest.fn() },
  };
}

describe('evaluateEvent', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it('does nothing when no rules match the event type', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([]);
    await evaluateEvent(makeEvent(), prisma as any);
    expect(prisma.automationExecution.create).not.toHaveBeenCalled();
  });

  it('runs the action and logs SUCCESS when conditions are empty (always matches)', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'pause_campaign', conditions: [], actionParams: null },
    ]);
    await evaluateEvent(makeEvent(), prisma as any);

    expect(prisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'campaign-1' }, data: { status: 'paused' } });
    expect(prisma.automationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ruleId: 'rule-1', eventId: 'event-1', status: 'SUCCESS', conditionsMet: true }),
    });
  });

  it('logs SKIPPED without running the action when a condition is not met', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'pause_campaign', conditions: [{ field: 'revenue', operator: 'gt', value: 100 }], actionParams: null },
    ]);
    await evaluateEvent(makeEvent({ payload: { revenue: 10 } }), prisma as any);

    expect(prisma.campaign.update).not.toHaveBeenCalled();
    expect(prisma.automationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'SKIPPED', conditionsMet: false }),
    });
  });

  it('runs the action when a numeric condition is met', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'resume_campaign', conditions: [{ field: 'revenue', operator: 'gte', value: 50 }], actionParams: null },
    ]);
    await evaluateEvent(makeEvent({ payload: { revenue: 50 } }), prisma as any);

    expect(prisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'campaign-1' }, data: { status: 'active' } });
  });

  it('logs FAILED with the error message when the action throws (e.g. no campaignId)', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'pause_campaign', conditions: [], actionParams: null },
    ]);
    await evaluateEvent(makeEvent({ campaignId: null }), prisma as any);

    expect(prisma.automationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED', conditionsMet: true, error: expect.stringContaining('requires an event tied to a campaign') }),
    });
  });

  it('logs FAILED for an unknown action without throwing', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'do_something_unsupported', conditions: [], actionParams: null },
    ]);
    await expect(evaluateEvent(makeEvent(), prisma as any)).resolves.toBeUndefined();

    expect(prisma.automationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('Unknown action') }),
    });
  });

  it('notify_slack posts to the webhook and logs SUCCESS', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.test/abc';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'notify_slack', conditions: [], actionParams: { message: 'hi' } },
    ]);
    await evaluateEvent(makeEvent({ type: 'conversion.received' }), prisma as any);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/abc',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'hi' }) }),
    );
    expect(prisma.automationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'SUCCESS' }),
    });
  });

  it('notify_slack logs FAILED when no webhook URL is configured', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'notify_slack', conditions: [], actionParams: null },
    ]);
    await evaluateEvent(makeEvent(), prisma as any);

    expect(prisma.automationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('SLACK_WEBHOOK_URL') }),
    });
  });

  it('evaluates multiple rules independently for the same event', async () => {
    const prisma = makePrisma();
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 'rule-1', action: 'pause_campaign', conditions: [], actionParams: null },
      { id: 'rule-2', action: 'pause_campaign', conditions: [{ field: 'revenue', operator: 'gt', value: 999 }], actionParams: null },
    ]);
    await evaluateEvent(makeEvent({ payload: { revenue: 1 } }), prisma as any);

    expect(prisma.automationExecution.create).toHaveBeenCalledTimes(2);
    expect(prisma.automationExecution.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ruleId: 'rule-1', status: 'SUCCESS' }) });
    expect(prisma.automationExecution.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ruleId: 'rule-2', status: 'SKIPPED' }) });
  });
});
