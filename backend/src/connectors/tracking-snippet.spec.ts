import { buildTrackingSnippet } from './tracking-snippet';

const TEMPLATE = 'https://api.gogobid.com/postback/voluum?secret={POSTBACK_SECRET}&cid={CLICK_ID}&txid={CONVERSION_ID}&revenue={REVENUE}';

describe('buildTrackingSnippet', () => {
  const snip = buildTrackingSnippet('camp_123', TEMPLATE);

  it('lists the full capability set', () => {
    expect(snip.capabilities).toEqual([
      'Click Tracking',
      'Conversion Tracking',
      'Revenue Tracking',
      'Attribution Validation',
      'Token Mapping',
      'S2S Postbacks',
    ]);
  });

  it('captures common click-id params (token mapping incl. gclid/fbclid/ttclid)', () => {
    for (const p of ['cid', 'clickid', 'gclid', 'fbclid', 'ttclid']) {
      expect(snip.clickIdParams).toContain(p);
    }
    // and they appear in the generated CLICK_PARAMS array
    expect(snip.js).toContain('var CLICK_PARAMS = ["cid"');
  });

  it('merges extra click params without duplicating', () => {
    const s = buildTrackingSnippet('c1', TEMPLATE, { extraClickParams: ['cid', 'wbraid'] });
    expect(s.clickIdParams.filter((p) => p === 'cid')).toHaveLength(1); // deduped
    expect(s.clickIdParams).toContain('wbraid');
  });

  it('embeds the campaign id and appends campaign_id to the conversion URL for server-side attribution', () => {
    expect(snip.js).toContain('campaignId: "camp_123"');
    expect(snip.js).toContain('&campaign_id=camp_123');
  });

  it('keeps the postback secret as a placeholder — never a real value in the client snippet', () => {
    expect(snip.js).toContain('{POSTBACK_SECRET}');
    expect(snip.js).not.toMatch(/secret=[A-Za-z0-9]{6,}/); // no concrete secret leaked
  });

  it('warns when no click id is found (attribution validation) and sets a first-party cookie', () => {
    expect(snip.js).toContain('may be unattributed');
    expect(snip.js).toContain('SameSite=Lax');
    expect(snip.js).toContain('var COOKIE = "ggclid"');
  });

  it('exposes a conversionUrl() API that fills in click id / order / revenue placeholders', () => {
    expect(snip.js).toContain('conversionUrl: function');
    expect(snip.js).toContain('.replace("{CLICK_ID}"');
    expect(snip.js).toContain('.replace("{CONVERSION_ID}"');
    expect(snip.js).toContain('.replace("{REVENUE}"');
  });
});
