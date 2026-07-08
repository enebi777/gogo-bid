// The connector registry — the single catalog every part of the app reads to
// answer "what is this provider and how do I connect to it?". Replaces the
// scattered, duplicated provider maps (integrations controller, worker,
// tracker field-map, frontend INT_CONNECTED) with one source of truth.
//
// Adding a provider = adding one entry here. No new branching elsewhere.

import { ConnectorDefinition, ConnectorCapabilities, ConnectionType } from './connector-types';

// Capability presets keep definitions terse and consistent per connection type.
const OAUTH_ADS: ConnectorCapabilities = { multiAccount: true, assetDiscovery: true, campaignImport: true, webhooks: true, postbacks: false, automation: true, ai: true };
const API_ADS: ConnectorCapabilities = { multiAccount: true, assetDiscovery: false, campaignImport: true, webhooks: false, postbacks: false, automation: true, ai: true };
const TRACKING: ConnectorCapabilities = { multiAccount: true, assetDiscovery: false, campaignImport: true, webhooks: true, postbacks: true, automation: true, ai: true };
const AFFILIATE: ConnectorCapabilities = { multiAccount: true, assetDiscovery: false, campaignImport: false, webhooks: true, postbacks: true, automation: true, ai: true };
const ANALYTICS: ConnectorCapabilities = { multiAccount: true, assetDiscovery: false, campaignImport: false, webhooks: false, postbacks: false, automation: false, ai: true };
const DESTINATION: ConnectorCapabilities = { multiAccount: true, assetDiscovery: false, campaignImport: false, webhooks: false, postbacks: false, automation: false, ai: false };

// Scaffold profile for affiliate networks whose exact params we haven't
// verified — common defaults (subid / txid / amount) marked 'generic' so the
// UI prompts the user to confirm rather than presenting them as authoritative.
const GENERIC_AFFILIATE_PROFILE = { clickIdParam: 'subid', conversionIdParam: 'txid', revenueParam: 'amount', confidence: 'generic' as const };

const def = (
  id: string,
  provider: string | null,
  name: string,
  category: ConnectorDefinition['category'],
  connectionType: ConnectionType,
  authProvider: string,
  capabilities: ConnectorCapabilities,
  priority: number,
  profile?: ConnectorDefinition['profile'],
  budgetGuidance?: ConnectorDefinition['budgetGuidance'],
): ConnectorDefinition => ({ id, provider, name, category, connectionType, authProvider, capabilities, priority, profile, budgetGuidance });

// Rough daily-budget floors per platform (configurable defaults, not rate
// cards). Search/managed OAuth platforms need more per day to gather signal;
// native/push run leaner. Tune these once real account data is available.
const B_OAUTH_SEARCH = { minDaily: 30, recommendedDaily: 100 }; // Google-style search auctions
const B_OAUTH_SOCIAL = { minDaily: 20, recommendedDaily: 50 }; // Meta / TikTok
const B_NATIVE = { minDaily: 25, recommendedDaily: 50 }; // Taboola / Outbrain / MGID / push

export const CONNECTORS: ConnectorDefinition[] = [
  // ── OAuth traffic sources ──
  def('meta_ads', 'META_ADS', 'Meta Ads', 'Traffic Source', 'oauth', 'facebook_login_business', OAUTH_ADS, 1, undefined, B_OAUTH_SOCIAL),
  def('google_ads', 'GOOGLE_ADS', 'Google Ads', 'Traffic Source', 'oauth', 'google_oauth', OAUTH_ADS, 2, undefined, B_OAUTH_SEARCH),
  def('tiktok_ads', 'TIKTOK_ADS', 'TikTok Ads', 'Traffic Source', 'oauth', 'tiktok_business_oauth', OAUTH_ADS, 3, undefined, B_OAUTH_SOCIAL),

  // ── API-key native / push traffic sources ──
  def('taboola', 'TABOOLA', 'Taboola', 'Traffic Source', 'api', 'api_key', API_ADS, 10, undefined, B_NATIVE),
  def('outbrain', 'OUTBRAIN', 'Outbrain', 'Traffic Source', 'api', 'api_key', API_ADS, 11, undefined, B_NATIVE),
  def('mgid', 'MGID', 'MGID', 'Traffic Source', 'api', 'api_key', API_ADS, 12, undefined, B_NATIVE),
  def('propellerads', 'PROPELLERADS', 'PropellerAds', 'Traffic Source', 'api', 'api_key', API_ADS, 13, undefined, B_NATIVE),

  // ── Trackers (postback profiles carried verbatim from the codebase's
  //    authoritative TRACKER_FIELD_MAP — this is now the source of truth) ──
  def('voluum', 'VOLUUM', 'Voluum', 'Tracker', 'tracking', 'postback_secret', TRACKING, 20, { clickIdParam: 'cid', conversionIdParam: 'txid', revenueParam: 'revenue', payoutParam: 'payout', confidence: 'verified' }),
  def('redtrack', 'REDTRACK', 'RedTrack', 'Tracker', 'tracking', 'postback_secret', TRACKING, 21, { clickIdParam: 'clickid', conversionIdParam: 'conversion_id', revenueParam: 'revenue', payoutParam: 'payout', confidence: 'verified' }),
  def('binom', 'BINOM', 'Binom', 'Tracker', 'tracking', 'postback_secret', TRACKING, 22, { clickIdParam: 'click_id', conversionIdParam: 'tx_id', revenueParam: 'revenue', payoutParam: 'payout', confidence: 'verified' }),
  def('bemob', 'BEMOB', 'BeMob', 'Tracker', 'tracking', 'postback_secret', TRACKING, 23, { clickIdParam: 'click_id', conversionIdParam: 'payout_id', revenueParam: 'revenue', payoutParam: 'payout', confidence: 'verified' }),
  def('keitaro', 'KEITARO', 'Keitaro', 'Tracker', 'tracking', 'postback_secret', TRACKING, 24, { clickIdParam: 'subid', conversionIdParam: 'tid', revenueParam: 'revenue', payoutParam: 'payout', confidence: 'verified' }),
  def('hyros', 'HYROS', 'Hyros', 'Tracker', 'tracking', 'postback_secret', TRACKING, 25, { clickIdParam: 'click_id', conversionIdParam: 'order_id', revenueParam: 'revenue', payoutParam: 'payout', confidence: 'verified' }),

  // ── Affiliate networks / marketplaces. ClickBank's profile is known (per
  //    its documented postback params); the rest carry no profile yet →
  //    Phase 2 (Smart Profiles) fills them. `profile: undefined` is honest:
  //    "connector recognized, field mapping not yet verified". ──
  def('clickbank', 'CLICKBANK', 'ClickBank', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 30, { clickIdParam: 'tid', conversionIdParam: 'cbreceipt', revenueParam: 'amount', confidence: 'verified' }),
  def('buygoods', 'BUYGOODS', 'BuyGoods', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 31, GENERIC_AFFILIATE_PROFILE),
  def('digistore24', 'DIGISTORE24', 'Digistore24', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 32, GENERIC_AFFILIATE_PROFILE),
  def('maxweb', 'MAXWEB', 'MaxWeb', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 33, GENERIC_AFFILIATE_PROFILE),
  def('gurumedia', 'GURUMEDIA', 'GuruMedia', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 34, GENERIC_AFFILIATE_PROFILE),
  def('terraleads', 'TERRALEADS', 'TerraLeads', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 35, GENERIC_AFFILIATE_PROFILE),
  def('leadrock', 'LEADROCK', 'LeadRock', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 36, GENERIC_AFFILIATE_PROFILE),
  def('cpahouse', 'CPAHOUSE', 'CPA House', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 37, GENERIC_AFFILIATE_PROFILE),
  def('monetizze', 'MONETIZZE', 'Monetizze', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 38, GENERIC_AFFILIATE_PROFILE),
  def('braip', 'BRAIP', 'Braip', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 39, GENERIC_AFFILIATE_PROFILE),
  def('kiwify', 'KIWIFY', 'Kiwify', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 40, GENERIC_AFFILIATE_PROFILE),
  def('perfectpay', 'PERFECTPAY', 'PerfectPay', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 41, GENERIC_AFFILIATE_PROFILE),
  def('cartpanda', 'CARTPANDA', 'CartPanda', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 42, GENERIC_AFFILIATE_PROFILE),
  def('hubla', 'HUBLA', 'Hubla', 'Affiliate Network', 'affiliate', 'api_key', AFFILIATE, 43, GENERIC_AFFILIATE_PROFILE),

  // ── Analytics (API data sources) ──
  def('ga4', 'GA4', 'Google Analytics 4', 'Analytics', 'api', 'google_oauth', ANALYTICS, 50),
  def('mixpanel', 'MIXPANEL', 'Mixpanel', 'Analytics', 'api', 'api_key', ANALYTICS, 51),
  def('amplitude', 'AMPLITUDE', 'Amplitude', 'Analytics', 'api', 'api_key', ANALYTICS, 52),

  // ── Destinations (outbound export) ──
  def('google_sheets', 'GOOGLE_SHEETS', 'Google Sheets', 'Destination', 'destination', 'google_oauth', DESTINATION, 60),
  def('looker_studio', 'LOOKER_STUDIO', 'Looker Studio', 'Destination', 'destination', 'google_oauth', DESTINATION, 61),
  def('power_bi', 'POWER_BI', 'Power BI', 'Destination', 'destination', 'microsoft_oauth', DESTINATION, 62),
];

// Multi-platform strategy guidance (best-practice "which platform for which
// goal"). Attached post-hoc so the CONNECTORS block above stays readable and
// the def() signature doesn't grow another positional arg.
const STRATEGY_HINTS: Record<string, string> = {
  google_ads: 'High-intent search — capture people actively searching for the offer.',
  meta_ads: 'Awareness & retargeting — visual, interest- and lookalike-based audiences.',
  tiktok_ads: 'Younger demographics & brand awareness — video-first, trend-driven.',
  taboola: 'Native content discovery — top-of-funnel scale on premium publishers.',
  outbrain: 'Native content discovery — top-of-funnel scale on premium publishers.',
  mgid: 'Native content discovery — cost-efficient top-of-funnel reach.',
  propellerads: 'Push & pop volume — cheap top-of-funnel testing at scale.',
};
for (const c of CONNECTORS) {
  const hint = STRATEGY_HINTS[c.id];
  if (hint) c.strategyHint = hint;
}

// Fast lookups (built once at module load).
const BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));
const BY_PROVIDER = new Map(CONNECTORS.filter((c) => c.provider).map((c) => [c.provider as string, c]));

export function listConnectors(type?: ConnectionType): ConnectorDefinition[] {
  const list = type ? CONNECTORS.filter((c) => c.connectionType === type) : CONNECTORS;
  return [...list].sort((a, b) => a.priority - b.priority);
}

export function getConnector(id: string): ConnectorDefinition | undefined {
  return BY_ID.get(id);
}

/** Look up by the Prisma IntegrationProvider enum member (e.g. 'META_ADS'). */
export function getConnectorByProvider(provider: string): ConnectorDefinition | undefined {
  return BY_PROVIDER.get(provider);
}

export function connectorsByType(type: ConnectionType): ConnectorDefinition[] {
  return listConnectors(type);
}

export function getProfile(id: string): ConnectorDefinition['profile'] | undefined {
  return BY_ID.get(id)?.profile;
}

export function getBudgetGuidance(id: string): ConnectorDefinition['budgetGuidance'] | undefined {
  return BY_ID.get(id)?.budgetGuidance;
}

export function getStrategyHint(id: string): string | undefined {
  return BY_ID.get(id)?.strategyHint;
}

// Maps the frontend campaign's traffic sourceKey (e.g. 'meta', 'google',
// 'push') to a connector id. Kept here so the one place that classifies
// providers also owns this aliasing.
const SOURCE_KEY_TO_CONNECTOR: Record<string, string> = {
  meta: 'meta_ads',
  facebook: 'meta_ads',
  google: 'google_ads',
  tiktok: 'tiktok_ads',
  taboola: 'taboola',
  outbrain: 'outbrain',
  mgid: 'mgid',
  propellerads: 'propellerads',
  push: 'propellerads',
};

/** Resolve a connector from a frontend traffic sourceKey (returns undefined for unknown/ambiguous e.g. generic 'native'). */
export function getConnectorBySourceKey(sourceKey: string): ConnectorDefinition | undefined {
  const id = SOURCE_KEY_TO_CONNECTOR[(sourceKey || '').toLowerCase()];
  return id ? BY_ID.get(id) : undefined;
}

/**
 * Tracker postback field names for a tracker slug (e.g. 'voluum' → {clickId:
 * 'cid', conversionId: 'txid'}). Back-compat shape for the postback adapter,
 * now sourced from the registry instead of a separate map.
 */
export function getTrackerFields(trackerSlug: string): { clickId: string; conversionId: string } | undefined {
  const p = BY_ID.get(trackerSlug)?.profile;
  if (!p) return undefined;
  return { clickId: p.clickIdParam, conversionId: p.conversionIdParam };
}
