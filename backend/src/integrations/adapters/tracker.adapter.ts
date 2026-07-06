import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { PostbackAdapter } from '../adapter.interface';
import { getTrackerFields } from '../../connectors/connector-registry';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Shared shape for tracker postbacks (Voluum, RedTrack, Binom, Bemob,
 * Keitaro, Hyros). Each tracker lets you configure your own postback URL
 * with custom macros, so the *fields* below are what we ask the user to map
 * to when they set up the postback URL in their tracker — not a fixed
 * vendor format. Validate with POSTBACK_SHARED_SECRET passed as a query param.
 *
 * Example postback URL the user pastes into their tracker:
 *   https://api.yourapp.com/postback/voluum?secret=XXXX&clickid={clickid}&payout={payout}&txid={transaction_id}
 */
@Injectable()
export class GenericTrackerAdapter implements PostbackAdapter {
  verifySignature(payload: Record<string, unknown>): boolean {
    const secret = process.env.POSTBACK_SHARED_SECRET;
    if (!secret) return false;
    return safeEqual(String(payload['secret'] ?? ''), secret);
  }

  normalize(tracker: string, payload: Record<string, unknown>) {
    // Field mappings now come from the connector registry (single source of
    // truth) rather than a local map — see connectors/connector-registry.ts.
    const fields = getTrackerFields(tracker);
    const clickIdRaw = (fields && payload[fields.clickId]) ?? payload['clickid'] ?? payload['click_id'];
    const conversionIdRaw =
      (fields && payload[fields.conversionId]) ?? payload['txid'] ?? payload['transaction_id'] ?? payload['conversion_id'];
    return {
      clickId: String(clickIdRaw ?? ''),
      conversionId: String(conversionIdRaw ?? ''),
      revenue: payload['revenue'] != null ? Number(payload['revenue']) : undefined,
      payout: payload['payout'] != null ? Number(payload['payout']) : undefined,
      campaignExternalId: payload['campaign_id'] != null ? String(payload['campaign_id']) : undefined,
    };
  }
}
