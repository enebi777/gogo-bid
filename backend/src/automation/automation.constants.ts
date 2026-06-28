// The full vocabulary this minimal automation loop supports today. Expanding
// either list is how new triggers/actions get added later — every
// AutomationRule is validated against these at create/update time.
export const TRIGGER_TYPES = ['campaign.created', 'campaign.paused', 'conversion.received'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const ACTIONS = ['pause_campaign', 'resume_campaign', 'notify_slack'] as const;
export type ActionType = (typeof ACTIONS)[number];

export const CONDITION_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
