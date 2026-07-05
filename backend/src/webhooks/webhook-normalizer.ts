// Pure webhook payload normalizer — no Prisma/Nest. Maps the two providers
// that push webhooks (Meta, TikTok) into a flat, provider-agnostic list of
// entity changes the processor upserts. Deliberately tolerant: unknown fields
// or shapes yield [] rather than throwing, so a malformed/foreign payload is a
// no-op (marked PROCESSED with nothing applied) instead of poisoning the queue.

export type WebhookEntityKind = 'campaign' | 'adset' | 'ad';

export interface WebhookEntityChange {
  accountExternalId: string; // resolves the owning IntegrationAccount
  kind: WebhookEntityKind;
  externalId: string;
  name?: string;
  status?: string; // normalized to 'active' | 'paused' where recognizable
  campaignExternalId?: string; // adset/ad → parent campaign
  adsetExternalId?: string; // ad → parent adset
}

/** Platform status strings → our lowercase status. Unknown values pass through lowercased. */
export function normalizeStatus(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).toUpperCase();
  if (['ACTIVE', 'ENABLE', 'ENABLED', 'CAMPAIGN_STATUS_ENABLE', 'AD_STATUS_DELIVERY_OK'].includes(s)) return 'active';
  if (['PAUSED', 'DISABLE', 'DISABLED', 'CAMPAIGN_STATUS_DISABLE', 'AD_STATUS_CAMPAIGN_PAUSED'].includes(s)) return 'paused';
  if (['DELETED', 'ARCHIVED', 'CAMPAIGN_STATUS_DELETE'].includes(s)) return 'archived';
  return String(raw).toLowerCase();
}

const str = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v));

/** Meta pushes { object, entry: [{ id: act_x, changes: [{ field, value }] }] }. */
function normalizeMeta(payload: any): WebhookEntityChange[] {
  const out: WebhookEntityChange[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const accountExternalId = str(entry?.id);
    if (!accountExternalId) continue;
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const v = ch?.value || {};
      const field = String(ch?.field || '').toLowerCase();
      if (field === 'campaign') {
        const externalId = str(v.campaign_id);
        if (externalId) out.push({ accountExternalId, kind: 'campaign', externalId, name: str(v.name), status: normalizeStatus(v.status) });
      } else if (field === 'adset') {
        const externalId = str(v.adset_id);
        if (externalId) out.push({ accountExternalId, kind: 'adset', externalId, name: str(v.name), status: normalizeStatus(v.status), campaignExternalId: str(v.campaign_id) });
      } else if (field === 'ad') {
        const externalId = str(v.ad_id);
        if (externalId) out.push({ accountExternalId, kind: 'ad', externalId, name: str(v.name), status: normalizeStatus(v.status), adsetExternalId: str(v.adset_id) });
      }
    }
  }
  return out;
}

/** TikTok pushes { advertiser_id, events: [{ type, campaign_id/adgroup_id/ad_id, ... }] }. */
function normalizeTikTok(payload: any): WebhookEntityChange[] {
  const out: WebhookEntityChange[] = [];
  const accountExternalId = str(payload?.advertiser_id);
  if (!accountExternalId) return out;
  const events = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload?.data) ? payload.data : [];
  for (const e of events) {
    const type = String(e?.type || e?.object || '').toLowerCase();
    if (type === 'campaign') {
      const externalId = str(e.campaign_id);
      if (externalId) out.push({ accountExternalId, kind: 'campaign', externalId, name: str(e.campaign_name ?? e.name), status: normalizeStatus(e.status ?? e.operation_status) });
    } else if (type === 'adgroup' || type === 'adset') {
      const externalId = str(e.adgroup_id ?? e.adset_id);
      if (externalId) out.push({ accountExternalId, kind: 'adset', externalId, name: str(e.adgroup_name ?? e.name), status: normalizeStatus(e.status ?? e.operation_status), campaignExternalId: str(e.campaign_id) });
    } else if (type === 'ad') {
      const externalId = str(e.ad_id);
      if (externalId) out.push({ accountExternalId, kind: 'ad', externalId, name: str(e.ad_name ?? e.name), status: normalizeStatus(e.status ?? e.operation_status), adsetExternalId: str(e.adgroup_id ?? e.adset_id) });
    }
  }
  return out;
}

export function normalizeWebhook(provider: string, payload: unknown): WebhookEntityChange[] {
  if (!payload || typeof payload !== 'object') return [];
  switch (provider) {
    case 'META_ADS':
      return normalizeMeta(payload);
    case 'TIKTOK_ADS':
      return normalizeTikTok(payload);
    default:
      return [];
  }
}
