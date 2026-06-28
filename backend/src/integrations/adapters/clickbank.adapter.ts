import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import { PostbackAdapter, SyncAdapter } from '../adapter.interface';

/**
 * ClickBank has no OAuth — auth is a developer key + clerk key pair
 * (CLICKBANK_DEV_KEY / CLICKBANK_CLERK_KEY) used as Basic Auth against the
 * Reporting API, plus the separate Instant Notification Service (INS) for
 * real-time sale/refund/chargeback postbacks (HMAC-signed).
 * Docs: https://support.clickbank.com/hc/en-us/articles/220376987
 */
@Injectable()
export class ClickBankAdapter implements PostbackAdapter, SyncAdapter {
  private readonly baseUrl = 'https://api.clickbank.com/rest/1.3';

  verifySignature(payload: Record<string, unknown>): boolean {
    const secret = process.env.CLICKBANK_CLERK_KEY;
    if (!secret) return false;
    const receipt = String(payload['receipt'] ?? '');
    const expected = createHmac('sha1', secret).update(receipt).digest('hex');
    return expected === String(payload['cbReceipt'] ?? '');
  }

  normalize(_tracker: string, payload: Record<string, unknown>) {
    return {
      clickId: String(payload['trackingId'] ?? payload['affiliate'] ?? ''),
      conversionId: String(payload['receipt'] ?? ''),
      revenue: Number(payload['totalAccountAmount'] ?? 0),
      payout: Number(payload['totalAccountAmount'] ?? 0),
      campaignExternalId: String(payload['trackingId'] ?? ''),
    };
  }

  async syncHistorical(integrationAccountId: string, sinceDate: Date): Promise<void> {
    // TODO once credentials exist: GET /analytics/orders with dev/clerk key
    // basic-auth, paginate, upsert into Order + Conversion.
    throw new Error('ClickBankAdapter.syncHistorical: not callable until CLICKBANK_DEV_KEY/CLERK_KEY are configured.');
  }

  async syncDaily(integrationAccountId: string): Promise<void> {
    throw new Error('ClickBankAdapter.syncDaily: not callable until CLICKBANK_DEV_KEY/CLERK_KEY are configured.');
  }
}
