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

  async syncDaily(integrationAccountId: string, ctx: SyncContext): Promise<void> {
    // TODO once credentials exist: load IntegrationAccount, decrypt token,
    // call /act_{ad_account_id}/insights with date_preset=yesterday,
    // upsert Campaign/AdSet/Ad + Cost rows via Prisma. Follow the pattern
    // built out in google-ads.adapter.ts's runSync for the Campaign/Cost/
    // Revenue upsert shape.
    throw new Error('MetaAdapter.syncDaily: not callable until META_APP_ID/SECRET are configured.');
  }

  async syncHistorical(integrationAccountId: string, sinceDate: Date, ctx: SyncContext): Promise<void> {
    throw new Error('MetaAdapter.syncHistorical: not callable until META_APP_ID/SECRET are configured.');
  }
}
