import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OAuthAdapter, SyncAdapter, SyncContext } from '../adapter.interface';

/**
 * Real Meta Marketing API endpoints — needs META_APP_ID / META_APP_SECRET
 * with Marketing API access approved by Meta App Review before this works
 * against live data. Until then, exchangeCodeForToken/syncDaily will throw
 * on the live HTTP call rather than return fabricated numbers.
 * Docs: https://developers.facebook.com/docs/marketing-api
 */
@Injectable()
export class MetaAdapter implements OAuthAdapter, SyncAdapter {
  private readonly graphVersion = process.env.META_GRAPH_API_VERSION ?? 'v20.0';
  private readonly baseUrl = `https://graph.facebook.com/${this.graphVersion}`;

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      redirect_uri: process.env.META_REDIRECT_URI ?? '',
      state,
      scope: 'ads_read,ads_management,business_management',
      response_type: 'code',
    });
    return `https://www.facebook.com/${this.graphVersion}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string) {
    const { data } = await axios.get(`${this.baseUrl}/oauth/access_token`, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.META_REDIRECT_URI,
        code,
      },
    });
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  async refreshAccessToken(refreshToken: string) {
    // Meta uses long-lived tokens rather than classic refresh tokens —
    // exchange the short-lived token for a long-lived one (~60 days).
    const { data } = await axios.get(`${this.baseUrl}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: refreshToken,
      },
    });
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  /** Lists ad accounts (act_XXXXXXXXXX) the connected user can manage — used for the "select your account" step after OAuth. */
  async listAccessibleAdAccounts(accessToken: string): Promise<{ id: string; name: string }[]> {
    const { data } = await axios.get(`${this.baseUrl}/me/adaccounts`, {
      params: { fields: 'id,name,account_status', access_token: accessToken, limit: 200 },
    });
    return (data.data ?? []).map((a: any) => ({ id: a.id, name: a.name }));
  }

  async syncDaily(integrationAccountId: string, ctx: SyncContext): Promise<void> {
    await this.runSync(integrationAccountId, ctx, 'yesterday');
  }

  async syncHistorical(integrationAccountId: string, sinceDate: Date, ctx: SyncContext): Promise<void> {
    const since = sinceDate.toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    await this.runSync(integrationAccountId, ctx, undefined, { since, until });
  }

  private async runSync(
    integrationAccountId: string,
    ctx: SyncContext,
    datePreset?: string,
    timeRange?: { since: string; until: string },
  ) {
    const account = await ctx.prisma.integrationAccount.findUnique({ where: { id: integrationAccountId } });
    if (!account) throw new Error(`IntegrationAccount ${integrationAccountId} not found.`);
    if (!account.accessTokenEnc) {
      throw new Error(`IntegrationAccount ${integrationAccountId} is missing a stored token — reconnect required.`);
    }
    if (!account.externalAccountId || account.externalAccountId === 'pending') {
      throw new Error(`IntegrationAccount ${integrationAccountId} has no ad account selected yet.`);
    }

    const accessToken = ctx.decrypt(account.accessTokenEnc);

    // Insights API, broken out per campaign per day so each row maps to one Cost/Revenue point.
    const { data } = await axios.get(`${this.baseUrl}/${account.externalAccountId}/insights`, {
      params: {
        access_token: accessToken,
        level: 'campaign',
        time_increment: 1,
        fields: 'campaign_id,campaign_name,spend,actions,action_values',
        ...(datePreset ? { date_preset: datePreset } : {}),
        ...(timeRange ? { time_range: JSON.stringify(timeRange) } : {}),
      },
    });

    for (const row of data.data ?? []) {
      const externalId = String(row.campaign_id ?? '');
      if (!externalId) continue;

      // Same caveat as the Google Ads adapter: matching by (integrationAccountId, name)
      // since Campaign has no dedicated externalId column yet.
      const existing = await ctx.prisma.campaign.findFirst({
        where: { integrationAccountId, name: row.campaign_name },
        select: { id: true },
      });
      const campaign = existing
        ? await ctx.prisma.campaign.update({ where: { id: existing.id }, data: {} })
        : await ctx.prisma.campaign.create({
            data: { organizationId: account.organizationId, integrationAccountId, name: row.campaign_name, status: 'active' },
          });

      const date = new Date(`${row.date_start}T00:00:00.000Z`);
      const costAmount = Number(row.spend ?? 0);
      const purchaseValue = (row.action_values ?? []).find((a: any) => a.action_type === 'purchase');
      const revenueAmount = Number(purchaseValue?.value ?? 0);

      await ctx.prisma.cost.upsert({
        where: { campaignId_date_source: { campaignId: campaign.id, date, source: 'META_ADS' } },
        update: { amount: costAmount },
        create: { campaignId: campaign.id, date, amount: costAmount, source: 'META_ADS' },
      });
      await ctx.prisma.revenue.upsert({
        where: { campaignId_date_source: { campaignId: campaign.id, date, source: 'META_ADS' } },
        update: { amount: revenueAmount },
        create: { campaignId: campaign.id, date, amount: revenueAmount, source: 'META_ADS' },
      });
    }

    await ctx.prisma.integrationAccount.update({
      where: { id: integrationAccountId },
      data: { lastSyncedAt: new Date(), status: 'CONNECTED' },
    });
  }
}
