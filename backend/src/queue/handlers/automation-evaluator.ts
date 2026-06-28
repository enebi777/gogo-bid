import type { PrismaClient, Event } from '@prisma/client';

type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
interface Condition {
  field: string;
  operator: Operator;
  value: number | string;
}

/** Empty conditions array = always matches (the rule fires on every occurrence of its trigger). */
function evaluateConditions(conditions: Condition[], payload: Record<string, unknown>): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((cond) => {
    const actual = payload[cond.field];
    if (actual === undefined || actual === null) return false;
    switch (cond.operator) {
      case 'gt':
        return Number(actual) > Number(cond.value);
      case 'gte':
        return Number(actual) >= Number(cond.value);
      case 'lt':
        return Number(actual) < Number(cond.value);
      case 'lte':
        return Number(actual) <= Number(cond.value);
      case 'eq':
        return String(actual) === String(cond.value);
      case 'neq':
        return String(actual) !== String(cond.value);
      default:
        return false;
    }
  });
}

interface ActionContext {
  event: Event;
  prisma: PrismaClient;
  params: Record<string, unknown> | null;
}

/**
 * Action registry. Each entry both performs the side effect and returns a
 * small JSON-able summary stored on AutomationExecution.actionResult — that
 * summary is what the Execution Log page actually displays.
 */
const ACTIONS: Record<string, (ctx: ActionContext) => Promise<Record<string, unknown>>> = {
  async pause_campaign({ event, prisma }) {
    if (!event.campaignId) throw new Error('pause_campaign requires an event tied to a campaign.');
    await prisma.campaign.update({ where: { id: event.campaignId }, data: { status: 'paused' } });
    return { action: 'pause_campaign', campaignId: event.campaignId };
  },
  async resume_campaign({ event, prisma }) {
    if (!event.campaignId) throw new Error('resume_campaign requires an event tied to a campaign.');
    await prisma.campaign.update({ where: { id: event.campaignId }, data: { status: 'active' } });
    return { action: 'resume_campaign', campaignId: event.campaignId };
  },
  async notify_slack({ event, params }) {
    const webhookUrl = (params?.webhookUrl as string) || process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) throw new Error('notify_slack requires SLACK_WEBHOOK_URL (env) or a webhookUrl action param.');
    const text = (params?.message as string) || `GoGo Bid automation fired for event "${event.type}".`;
    const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error(`Slack webhook responded with HTTP ${res.status}`);
    return { action: 'notify_slack', message: text };
  },
};

/**
 * Finds every enabled AutomationRule matching this event's org+type,
 * evaluates its conditions against the event payload, and runs the matched
 * action — logging exactly one AutomationExecution per rule regardless of
 * outcome (skipped/success/failed), so the Execution Log is a complete
 * audit trail rather than only showing successes.
 */
export async function evaluateEvent(event: Event, prisma: PrismaClient): Promise<void> {
  const rules = await prisma.automationRule.findMany({
    where: {
      organizationId: event.organizationId,
      triggerType: event.type,
      enabled: true,
      // A rule with no campaignId applies org-wide; a scoped rule only
      // matches events for that exact campaign.
      OR: [{ campaignId: null }, { campaignId: event.campaignId }],
    },
  });

  for (const rule of rules) {
    const conditions = (rule.conditions as unknown as Condition[]) || [];
    const conditionsMet = evaluateConditions(conditions, event.payload as Record<string, unknown>);

    if (!conditionsMet) {
      await prisma.automationExecution.create({
        data: { ruleId: rule.id, eventId: event.id, status: 'SKIPPED', conditionsMet: false },
      });
      continue;
    }

    const actionFn = ACTIONS[rule.action];
    if (!actionFn) {
      await prisma.automationExecution.create({
        data: { ruleId: rule.id, eventId: event.id, status: 'FAILED', conditionsMet: true, error: `Unknown action "${rule.action}".` },
      });
      continue;
    }

    try {
      const result = await actionFn({ event, prisma, params: (rule.actionParams as Record<string, unknown>) ?? null });
      await prisma.automationExecution.create({
        data: { ruleId: rule.id, eventId: event.id, status: 'SUCCESS', conditionsMet: true, actionResult: result as any },
      });
    } catch (err: any) {
      await prisma.automationExecution.create({
        data: { ruleId: rule.id, eventId: event.id, status: 'FAILED', conditionsMet: true, error: err.message },
      });
    }
  }
}
