import { GenericTrackerAdapter } from './tracker.adapter';

describe('GenericTrackerAdapter', () => {
  const ORIGINAL_ENV = process.env.POSTBACK_SHARED_SECRET;
  let adapter: GenericTrackerAdapter;

  beforeEach(() => {
    process.env.POSTBACK_SHARED_SECRET = 'shh-its-a-secret';
    adapter = new GenericTrackerAdapter();
  });

  afterAll(() => {
    process.env.POSTBACK_SHARED_SECRET = ORIGINAL_ENV;
  });

  describe('verifySignature', () => {
    it('accepts a payload whose secret matches', () => {
      expect(adapter.verifySignature({ secret: 'shh-its-a-secret' })).toBe(true);
    });

    it('rejects a payload with a wrong or missing secret', () => {
      expect(adapter.verifySignature({ secret: 'wrong' })).toBe(false);
      expect(adapter.verifySignature({})).toBe(false);
    });

    it('rejects when POSTBACK_SHARED_SECRET is not configured', () => {
      delete process.env.POSTBACK_SHARED_SECRET;
      expect(adapter.verifySignature({ secret: 'shh-its-a-secret' })).toBe(false);
    });
  });

  describe('normalize', () => {
    it('maps generic field names when the tracker has no specific mapping', () => {
      const result = adapter.normalize('unknown-tracker', { clickid: 'c1', txid: 't1', revenue: '10', payout: '5' });
      expect(result).toMatchObject({ clickId: 'c1', conversionId: 't1', revenue: 10, payout: 5 });
    });

    it("maps voluum's field names (cid/txid)", () => {
      const result = adapter.normalize('voluum', { cid: 'voluum-click', txid: 'voluum-conv' });
      expect(result.clickId).toBe('voluum-click');
      expect(result.conversionId).toBe('voluum-conv');
    });

    it("maps binom's field names (click_id/tx_id) — distinct from the generic fallback", () => {
      const result = adapter.normalize('binom', { click_id: 'binom-click', tx_id: 'binom-conv' });
      expect(result.clickId).toBe('binom-click');
      expect(result.conversionId).toBe('binom-conv');
    });

    it("maps keitaro's field names (subid/tid)", () => {
      const result = adapter.normalize('keitaro', { subid: 'keitaro-click', tid: 'keitaro-conv' });
      expect(result.clickId).toBe('keitaro-click');
      expect(result.conversionId).toBe('keitaro-conv');
    });

    it('carries through campaignExternalId and numeric revenue/payout', () => {
      const result = adapter.normalize('voluum', { cid: 'c1', txid: 't1', campaign_id: 'camp-42', revenue: '99.5', payout: '20' });
      expect(result.campaignExternalId).toBe('camp-42');
      expect(result.revenue).toBe(99.5);
      expect(result.payout).toBe(20);
    });

    it('returns empty strings (not undefined) when fields are absent', () => {
      const result = adapter.normalize('voluum', {});
      expect(result.clickId).toBe('');
      expect(result.conversionId).toBe('');
    });
  });
});
