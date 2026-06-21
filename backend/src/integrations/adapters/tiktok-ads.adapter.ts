import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OAuthAdapter, SyncAdapter, SyncContext } from '../adapter.interface';

/**
 * Real TikTok Marketing API OAuth + Integrated Reporting endpoints.
 * Docs: https://ads.tiktok.com/marketing_api/docs
 */
@Injectable()
export class TikTokAdsAdapter implements OAuthAdapter, SyncAdapter {
  private readonly baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      app_id: process.env.TIKTOK_APP_ID ?? '',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI ?? '',
      state,
      rid: state,
    });
    return `https://business-api.tiktok.com/portal/auth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string) {
    const { data } = await axios.post(`${this.baseUrl}/oauth2/access_token/`, {
      app_id: process.env.TIKTOK_APP_ID,
      secret: process.env.TIKTOK_APP_SECRET,
      auth_code: code,
      grant_type: 'authorization_code',
    });
    // advertiser_ids can contain more than one account under the same TikTok
    // Business Center login — surfaced as availableAccounts by the controller,
    // same as Meta/Google, rather than silently picking one.
    const advertiserIds: string[] = data.data?.advertiser_ids ?? [];
    return { accessToken: data.data?.access_token, accountId: advertiserIds[0], advertiserIds };
  }

  async refreshAccessToken(): Promise<{ accessToken: string }> {
    // TikTok access tokens are long-lived (no refresh-token rotation as of v1.3) —
    // reconnection via getAuthorizationUrl() is the supported path if access is revoked.
    throw new Error('TikTokAdsAdapter: token does not expire on a refresh cycle; re-auth instead.');
  }

  /** Resolves advertiser_id -> display name for the account-selection step. Falls back to bare IDs if this call fails (e.g. insufficient scope). */
  async listAccessibleAdvertisers(accessToken: string, advertiserIds: string[]): Promise<{ id: string; name?: string }[]> {
    if (!advertiserIds.length) return [];
    try {
      const { data } = await axios.get(`${this.baseUrl}/advertiser/info/`, {
        headers: { 'Access-Token': accessToken },
        params: { advertiser_ids: JSON.stringify(advertiserIds) },
      });
      return (data.data?.list ?? []).map((a: any) => ({ id: String(a.advertiser_id), name: a.name }));
    } catch {
      return advertiserIds.map((id) => ({ id }));
    }
  }

  async syncDaily(integrationAccountId: string, ctx: SyncContext): Promise<void> {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await this.runSync(integrationAccountId, ctx, start, end);
  }

  async syncHistorical(integrationAccountId: string, sinceDate: Date, ctx: SyncContext): Promise<void> {
    const end = new Date().toISOString().slice(0, 10);
    const start = sinceDate.toISOString().slice(0, 10);
    await this.runSync(integrationAccountId, ctx, start, end);
  }

  private async runSync(integrationAccountId: string, ctx: SyncContext, startDate: string, endDate: string) {
    const account = await ctx.prisma.integrationAccount.findUnique({ where: { id: integrationAccountId } });
    if (!account) throw new Error(`IntegrationAccount ${integrationAccountId} not found.`);
    if (!account.accessTokenEnc) {
      throw new Error(`IntegrationAccount ${integrationAccountId} is missing a stored token — reconnect required.`);
    }
    if (!account.externalAccountId || account.externalAccountId === 'pending') {
      throw new Error(`IntegrationAccount ${integrationAccountId} has no advertiser account selected yet.`);
    }

    const accessToken = ctx.decrypt(account.accessTokenEnc);

    // Integrated Reporting API: one row per campaign per day in the window.
    const { data } = await axios.get(`${this.baseUrl}/report/integrated/get/`, {
      headers: { 'Access-Token': accessToken },
      params: {
        advertiser_id: account.externalAccountId,
        report_type: 'BASIC',
        dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
        metrics: JSON.stringify(['campaign_name', 'spend', 'total_complete_payment_rate', 'complete_payment_roas']),
        start_date: startDate,
        end_date: endDate,
        page_size: 1000,
      },
    });

    const rows = data.data?.list ?? [];
    for (const row of rows) {
      const externalId = String(row.dimensions?.campaign_id ?? '');
      if (!externalId) continue;
      const campaignName = row.metrics?.campaign_name ?? `TikTok Campaign ${externalId}`;

      // Same caveat as the Google/Meta adapters: matches by (integrationAccountId, name)
      // since Campaign has no dedicated externalId column yet.
      const existing = await ctx.prisma.campaign.findFirst({
        where: { integrationAccountId, name: campaignName },
        select: { id: true },
      });
      const campaign = existing
        ? existing
        : await ctx.prisma.campaign.create({
            data: { organizationId: account.organizationId, integrationAccountId, name: campaignName, status: 'active' },
          });

      const date = new Date(`${row.dimensions.stat_time_day.slice(0, 10)}T00:00:00.000Z`);
      const costAmount = Number(row.metrics?.spend ?? 0);
      const roas = Number(row.metrics?.complete_payment_roas ?? 0);
      const revenueAmount = costAmount * roas;

      await ctx.prisma.cost.upsert({
        where: { campaignId_date_source: { campaignId: campaign.id, date, source: 'TIKTOK_ADS' } },
        update: { amount: costAmount },
        create: { campaignId: campaign.id, date, amount: costAmount, source: 'TIKTOK_ADS' },
      });
      await ctx.prisma.revenue.upsert({
        where: { campaignId_date_source: { campaignId: campaign.id, date, source: 'TIKTOK_ADS' } },
        update: { amount: revenueAmount },
        create: { campaignId: campaign.id, date, amount: revenueAmount, source: 'TIKTOK_ADS' },
      });
    }

    await ctx.prisma.integrationAccount.update({
      where: { id: integrationAccountId },
      data: { lastSyncedAt: new Date(), status: 'CONNECTED' },
    });
  }
}
