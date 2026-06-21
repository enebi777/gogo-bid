import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OAuthAdapter, SyncAdapter, SyncContext } from '../adapter.interface';

/**
 * Real TikTok Marketing API OAuth + reporting endpoints.
 * Docs: https://ads.tiktok.com/marketing_api/docs
 */
@Injectable()
export class TikTokAdsAdapter implements OAuthAdapter, SyncAdapter {
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
    const { data } = await axios.post('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      app_id: process.env.TIKTOK_APP_ID,
      secret: process.env.TIKTOK_APP_SECRET,
      auth_code: code,
      grant_type: 'authorization_code',
    });
    return { accessToken: data.data?.access_token, accountId: data.data?.advertiser_ids?.[0] };
  }

  async refreshAccessToken(): Promise<{ accessToken: string }> {
    // TikTok access tokens are long-lived (no refresh-token rotation as of v1.3) —
    // reconnection via getAuthorizationUrl() is the supported path if access is revoked.
    throw new Error('TikTokAdsAdapter: token does not expire on a refresh cycle; re-auth instead.');
  }

  async syncDaily(integrationAccountId: string, ctx: SyncContext): Promise<void> {
    throw new Error('TikTokAdsAdapter.syncDaily: not callable until TIKTOK_APP_ID/SECRET are configured.');
  }

  async syncHistorical(integrationAccountId: string, sinceDate: Date, ctx: SyncContext): Promise<void> {
    throw new Error('TikTokAdsAdapter.syncHistorical: not callable until TIKTOK_APP_ID/SECRET are configured.');
  }
}
