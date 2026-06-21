import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { GoogleAdsApi, enums } from 'google-ads-api';
import { OAuthAdapter, SyncAdapter, SyncContext } from '../adapter.interface';

/**
 * Real Google OAuth + Google Ads API integration via the `google-ads-api`
 * client (Opteo's widely-used unofficial Node wrapper around the official
 * gRPC/REST service). Requires:
 *   - a Google Cloud OAuth 2.0 client (GOOGLE_CLIENT_ID/SECRET)
 *   - an approved Google Ads developer token (GOOGLE_ADS_DEVELOPER_TOKEN) —
 *     "test account" access works against a Google Ads test manager account
 *     immediately; "basic" access (read-only reporting) requires Google's
 *     approval and works against real accounts.
 * Docs: https://developers.google.com/google-ads/api/docs/start
 *       https://github.com/Opteo/google-ads-api
 */
@Injectable()
export class GoogleAdsAdapter implements OAuthAdapter, SyncAdapter {
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? '',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/adwords',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string) {
    const { data } = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
      code,
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }

  async refreshAccessToken(refreshToken: string) {
    const { data } = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  /** Lists ad accounts the connected Google identity can access — used to populate the "select your account" step after OAuth. */
  async listAccessibleCustomers(accessToken: string, refreshToken: string): Promise<string[]> {
    const client = this.buildClient(accessToken, refreshToken);
    const resourceNames = await client.listAccessibleCustomers(refreshToken);
    // resourceNames look like "customers/1234567890"
    return resourceNames.resource_names.map((r: string) => r.split('/')[1]);
  }

  async syncDaily(integrationAccountId: string, ctx: SyncContext): Promise<void> {
    await this.runSync(integrationAccountId, ctx, this.dateRange(1));
  }

  async syncHistorical(integrationAccountId: string, sinceDate: Date, ctx: SyncContext): Promise<void> {
    const days = Math.max(1, Math.ceil((Date.now() - sinceDate.getTime()) / 86_400_000));
    await this.runSync(integrationAccountId, ctx, this.dateRange(days));
  }

  private dateRange(daysBack: number) {
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const end = new Date();
    const start = new Date(Date.now() - daysBack * 86_400_000);
    return { start: fmt(start), end: fmt(end) };
  }

  private async runSync(integrationAccountId: string, ctx: SyncContext, range: { start: string; end: string }) {
    const account = await ctx.prisma.integrationAccount.findUnique({ where: { id: integrationAccountId } });
    if (!account) throw new Error(`IntegrationAccount ${integrationAccountId} not found.`);
    if (!account.accessTokenEnc || !account.refreshTokenEnc) {
      throw new Error(`IntegrationAccount ${integrationAccountId} is missing stored tokens — reconnect required.`);
    }

    const accessToken = ctx.decrypt(account.accessTokenEnc);
    const refreshToken = ctx.decrypt(account.refreshTokenEnc);
    const client = this.buildClient(accessToken, refreshToken);
    const customer = client.Customer({
      customer_id: account.externalAccountId,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      refresh_token: refreshToken,
    });

    // GAQL: one row per campaign per day in the window, with the metrics we map to Cost/Revenue.
    const rows = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign_budget.amount_micros,
        segments.date,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.clicks
      FROM campaign
      WHERE segments.date BETWEEN '${this.gaqlDate(range.start)}' AND '${this.gaqlDate(range.end)}'
    `);

    for (const row of rows) {
      const externalId = String(row.campaign?.id ?? '');
      if (!externalId) continue;

      const campaign = await ctx.prisma.campaign.upsert({
        where: {
          // No natural unique constraint on (integrationAccountId, externalId) in the
          // current schema beyond `id` — matching by name+account here; recommend
          // adding a dedicated externalId column + unique index before relying on
          // this in production with renamed campaigns.
          id: (await ctx.prisma.campaign.findFirst({
            where: { integrationAccountId, name: row.campaign.name },
            select: { id: true },
          }))?.id ?? '__none__',
        },
        update: { status: this.mapStatus(row.campaign.status) },
        create: {
          organizationId: account.organizationId,
          integrationAccountId,
          name: row.campaign.name,
          status: this.mapStatus(row.campaign.status),
          dailyBudget: row.campaign_budget?.amount_micros ? Number(row.campaign_budget.amount_micros) / 1_000_000 : null,
        },
      });

      const date = new Date(`${row.segments.date}T00:00:00.000Z`);
      const costAmount = Number(row.metrics?.cost_micros ?? 0) / 1_000_000;
      const revenueAmount = Number(row.metrics?.conversions_value ?? 0);

      await ctx.prisma.cost.upsert({
        where: { campaignId_date_source: { campaignId: campaign.id, date, source: 'GOOGLE_ADS' } },
        update: { amount: costAmount },
        create: { campaignId: campaign.id, date, amount: costAmount, source: 'GOOGLE_ADS' },
      });
      await ctx.prisma.revenue.upsert({
        where: { campaignId_date_source: { campaignId: campaign.id, date, source: 'GOOGLE_ADS' } },
        update: { amount: revenueAmount },
        create: { campaignId: campaign.id, date, amount: revenueAmount, source: 'GOOGLE_ADS' },
      });
    }

    await ctx.prisma.integrationAccount.update({
      where: { id: integrationAccountId },
      data: { lastSyncedAt: new Date(), status: 'CONNECTED' },
    });
  }

  private buildClient(accessToken: string, refreshToken: string) {
    const api = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    });
    return api;
  }

  private mapStatus(gaqlStatus: number | string): string {
    const s = String(gaqlStatus);
    if (s === String(enums?.CampaignStatus?.ENABLED) || s === 'ENABLED') return 'active';
    if (s === String(enums?.CampaignStatus?.PAUSED) || s === 'PAUSED') return 'paused';
    return 'stopped';
  }

  private gaqlDate(yyyymmdd: string): string {
    return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  }
}
