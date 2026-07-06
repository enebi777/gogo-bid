// Universal connector foundation — the type system for classifying every
// integration by *connection type* rather than by vendor. This is the base
// the rest of the platform (OAuth engine, asset discovery, sync, the
// frontend integration directory) reads, so a new provider is added by
// dropping a definition into the registry — no new branching in the app.

import type { OAuthAdapter, SyncAdapter } from '../integrations/adapter.interface';

/**
 * How we connect to a provider. This is the PRIMARY auth/connection mechanism;
 * a connector can additionally support webhooks/postbacks via capability flags
 * below (e.g. Meta is `oauth` but also `supportsWebhooks`).
 */
export type ConnectionType =
  | 'oauth' // Facebook/Google/TikTok-style OAuth 2.0
  | 'api' // API key / personal access token (native ad networks, analytics)
  | 'tracking' // click/conversion tracker via S2S postback (Voluum, Binom…)
  | 'affiliate' // affiliate network / marketplace (ClickBank, BuyGoods…)
  | 'webhook' // inbound-only webhook connector
  | 'destination' // outbound data export (Sheets, Looker, Power BI)
  | 'ai'; // AI/LLM provider

/** Display grouping in the integration directory (independent of ConnectionType). */
export type ConnectorCategory =
  | 'Traffic Source'
  | 'Affiliate Network'
  | 'Tracker'
  | 'Analytics'
  | 'Destination'
  | 'AI';

/**
 * What a connector can do once connected — read by the UI (to show the right
 * actions) and by feature code (to decide, generically, whether a capability
 * is available) instead of hardcoding per-provider `if` checks.
 */
export interface ConnectorCapabilities {
  multiAccount: boolean; // unlimited connected accounts per org
  assetDiscovery: boolean; // auto-discovers accounts/assets after auth
  campaignImport: boolean; // pulls campaigns into the unified model
  webhooks: boolean; // receives push webhooks
  postbacks: boolean; // receives S2S conversion postbacks
  automation: boolean; // eligible for automation rules
  ai: boolean; // feeds AI intelligence
}

/**
 * "Smart profile" for tracking/affiliate connectors: the query-param names the
 * provider uses for the core concepts, so postback/tracking URLs can be
 * generated and inbound payloads normalized without the user looking anything
 * up. (Phase 2 — Smart Profiles — expands these; this phase defines the shape
 * and seeds the ones already known in the codebase.)
 */
export interface ConnectorProfile {
  clickIdParam: string;
  conversionIdParam: string;
  revenueParam?: string;
  payoutParam?: string;
  statusParam?: string;
  currencyParam?: string;
  // 'verified' = field names confirmed from the provider's docs / the codebase's
  // authoritative tracker map. 'generic' = a sensible scaffold the user should
  // confirm against their account. Surfaced in the UI so a generated postback
  // URL never silently presents an unverified mapping as gospel.
  confidence?: 'verified' | 'generic';
}

export interface ConnectorDefinition {
  /** Stable url-safe slug, e.g. "meta_ads", "voluum", "clickbank". */
  id: string;
  /** The Prisma IntegrationProvider enum member, or null for not-yet-persisted connectors. */
  provider: string | null;
  name: string;
  category: ConnectorCategory;
  connectionType: ConnectionType;
  /** How the user authenticates: 'facebook_login_business' | 'google_oauth' | 'api_key' | 'postback_secret' | … */
  authProvider: string;
  capabilities: ConnectorCapabilities;
  /** Present for tracking/affiliate connectors whose field mapping is known. */
  profile?: ConnectorProfile;
  /** Lower = higher up the directory. */
  priority: number;
}

// ── Connector SDK (unified lifecycle) ──────────────────────────────────────
// The shared contract an OAuth connector implementation fulfils. Composes the
// existing adapter interfaces and adds asset discovery, so every OAuth
// provider — Meta, Google, TikTok, and future ones — plugs into one lifecycle:
//   connect → callback/exchange → refresh → discoverAssets → sync → disconnect.

export interface AssetNode {
  kind: string; // 'business_manager' | 'ad_account' | 'pixel' | 'campaign' | 'workspace' | …
  id: string;
  name?: string;
  children?: AssetNode[];
}

export interface AssetDiscoveryAdapter {
  /** Walk the provider's account/asset tree after authentication. */
  discoverAssets(accessToken: string, refreshToken?: string): Promise<AssetNode[]>;
}

/**
 * Unified connector lifecycle. Concrete adapters implement the parts their
 * connection type needs (an `api`/`tracking` connector won't implement OAuth
 * methods), which is why the composed members are optional here.
 */
export type ConnectorLifecycle = Partial<OAuthAdapter> & Partial<SyncAdapter> & Partial<AssetDiscoveryAdapter>;
