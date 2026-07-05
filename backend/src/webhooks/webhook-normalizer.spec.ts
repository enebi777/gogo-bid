import { normalizeWebhook, normalizeStatus } from './webhook-normalizer';

describe('normalizeStatus', () => {
  it('maps platform statuses to our vocabulary', () => {
    expect(normalizeStatus('ACTIVE')).toBe('active');
    expect(normalizeStatus('ENABLE')).toBe('active');
    expect(normalizeStatus('PAUSED')).toBe('paused');
    expect(normalizeStatus('CAMPAIGN_STATUS_DISABLE')).toBe('paused');
    expect(normalizeStatus('DELETED')).toBe('archived');
  });
  it('lowercases unknown statuses and passes undefined through', () => {
    expect(normalizeStatus('SomethingElse')).toBe('somethingelse');
    expect(normalizeStatus(undefined)).toBeUndefined();
    expect(normalizeStatus(null)).toBeUndefined();
  });
});

describe('normalizeWebhook', () => {
  it('returns [] for junk / unknown providers', () => {
    expect(normalizeWebhook('META_ADS', null)).toEqual([]);
    expect(normalizeWebhook('META_ADS', {})).toEqual([]);
    expect(normalizeWebhook('WHATEVER', { entry: [] })).toEqual([]);
    expect(normalizeWebhook('META_ADS', { entry: [{ id: 'act_1', changes: [{ field: 'unknown', value: {} }] }] })).toEqual([]);
  });

  it('normalizes a Meta campaign/adset/ad payload', () => {
    const payload = {
      object: 'adaccount',
      entry: [
        {
          id: 'act_123',
          changes: [
            { field: 'campaign', value: { campaign_id: 'c1', name: 'Summer US', status: 'ACTIVE' } },
            { field: 'adset', value: { adset_id: 'as1', campaign_id: 'c1', name: 'AS1', status: 'PAUSED' } },
            { field: 'ad', value: { ad_id: 'ad1', adset_id: 'as1', name: 'Creative A', status: 'ACTIVE' } },
          ],
        },
      ],
    };
    const out = normalizeWebhook('META_ADS', payload);
    expect(out).toEqual([
      { accountExternalId: 'act_123', kind: 'campaign', externalId: 'c1', name: 'Summer US', status: 'active' },
      { accountExternalId: 'act_123', kind: 'adset', externalId: 'as1', name: 'AS1', status: 'paused', campaignExternalId: 'c1' },
      { accountExternalId: 'act_123', kind: 'ad', externalId: 'ad1', name: 'Creative A', status: 'active', adsetExternalId: 'as1' },
    ]);
  });

  it('skips Meta changes missing their id', () => {
    const out = normalizeWebhook('META_ADS', { entry: [{ id: 'act_1', changes: [{ field: 'campaign', value: { name: 'no id' } }] }] });
    expect(out).toEqual([]);
  });

  it('normalizes a TikTok events payload (adgroup → adset)', () => {
    const payload = {
      advertiser_id: '70123',
      events: [
        { type: 'campaign', campaign_id: 'c9', campaign_name: 'TT Camp', status: 'ENABLE' },
        { type: 'adgroup', adgroup_id: 'g9', campaign_id: 'c9', adgroup_name: 'Group', operation_status: 'DISABLE' },
        { type: 'ad', ad_id: 'a9', adgroup_id: 'g9', ad_name: 'TT Ad', status: 'ENABLE' },
      ],
    };
    const out = normalizeWebhook('TIKTOK_ADS', payload);
    expect(out).toEqual([
      { accountExternalId: '70123', kind: 'campaign', externalId: 'c9', name: 'TT Camp', status: 'active' },
      { accountExternalId: '70123', kind: 'adset', externalId: 'g9', name: 'Group', status: 'paused', campaignExternalId: 'c9' },
      { accountExternalId: '70123', kind: 'ad', externalId: 'a9', name: 'TT Ad', status: 'active', adsetExternalId: 'g9' },
    ]);
  });

  it('returns [] for TikTok without advertiser_id', () => {
    expect(normalizeWebhook('TIKTOK_ADS', { events: [{ type: 'campaign', campaign_id: 'c1' }] })).toEqual([]);
  });
});
