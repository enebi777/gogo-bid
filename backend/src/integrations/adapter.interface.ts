/**
 * Common contract every traffic-source / network / tracker adapter implements.
 * New providers (Taboola, Outbrain, ClickBank, Voluum, ...) plug in here —
 * the rest of the app (sync workers, campaign performance aggregation,
 * webhook routing) is written against this interface, not any one vendor.
 */
export interface OAuthAdapter {
  getAuthorizationUrl(state: string): string;
  exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    accountId?: string;
  }>;
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }>;
}

/**
 * Workers run as a plain Node script (no Nest DI container), so sync
 * adapters receive their dependencies explicitly rather than via
 * constructor injection.
 */
export interface SyncContext {
  prisma: import('@prisma/client').PrismaClient;
  decrypt: (ciphertext: string) => string;
  encrypt: (plaintext: string) => string;
}

export interface SyncAdapter {
  /** Pull the latest campaign/cost/performance data for one connected account. */
  syncDaily(integrationAccountId: string, ctx: SyncContext): Promise<void>;
  /** One-time backfill when an account is first connected. */
  syncHistorical(integrationAccountId: string, sinceDate: Date, ctx: SyncContext): Promise<void>;
}

export interface PostbackAdapter {
  /** Validate the inbound postback's signature/secret before trusting it. */
  verifySignature(payload: Record<string, unknown>, headers: Record<string, string>): boolean;
  /**
   * Map the provider's raw postback shape into our normalized Click/Conversion
   * model. `tracker` is the lowercase slug (e.g. "voluum") used to look up
   * that tracker's field names — different trackers use different query-param
   * names for the same concept (see TRACKER_FIELD_MAP).
   */
  normalize(tracker: string, payload: Record<string, unknown>): {
    clickId: string;
    conversionId?: string;
    revenue?: number;
    payout?: number;
    campaignExternalId?: string;
  };
}
