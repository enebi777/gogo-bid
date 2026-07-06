import { buildPostbackConfig } from './auto-config';
import { getConnector } from './connector-registry';

const opts = { baseUrl: 'https://api.gogobid.com', secretPlaceholder: 'SECRET123' };

describe('buildPostbackConfig', () => {
  it('generates a ready-to-paste URL for a verified tracker (Voluum)', () => {
    const cfg = buildPostbackConfig(getConnector('voluum')!, opts);
    expect(cfg.supported).toBe(true);
    expect(cfg.confidence).toBe('verified');
    expect(cfg.url).toBe('https://api.gogobid.com/postback/voluum?secret=SECRET123&cid={CLICK_ID}&txid={CONVERSION_ID}&revenue={REVENUE}&payout={PAYOUT}');
    // click id + conversion id are required, revenue/payout optional
    expect(cfg.fields.find((f) => f.role === 'clickId')).toMatchObject({ param: 'cid', required: true });
    expect(cfg.fields.find((f) => f.role === 'revenue')).toMatchObject({ param: 'revenue', required: false });
  });

  it('uses the provider param names, not generic ones (Binom)', () => {
    const cfg = buildPostbackConfig(getConnector('binom')!, opts);
    expect(cfg.url).toContain('click_id={CLICK_ID}');
    expect(cfg.url).toContain('tx_id={CONVERSION_ID}');
  });

  it('marks an affiliate scaffold as generic and adds a confirm note', () => {
    const cfg = buildPostbackConfig(getConnector('buygoods')!, opts);
    expect(cfg.supported).toBe(true);
    expect(cfg.confidence).toBe('generic');
    expect(cfg.notes.some((n) => /generic scaffold/i.test(n))).toBe(true);
    expect(cfg.url).toContain('subid={CLICK_ID}');
  });

  it('treats ClickBank as verified with its documented params', () => {
    const cfg = buildPostbackConfig(getConnector('clickbank')!, opts);
    expect(cfg.confidence).toBe('verified');
    expect(cfg.url).toContain('tid={CLICK_ID}');
    expect(cfg.url).toContain('cbreceipt={CONVERSION_ID}');
    expect(cfg.url).toContain('amount={REVENUE}');
    // ClickBank profile has no payout param → not in the URL
    expect(cfg.fields.find((f) => f.role === 'payout')).toBeUndefined();
  });

  it('returns supported:false for a connector without postbacks (Meta)', () => {
    const cfg = buildPostbackConfig(getConnector('meta_ads')!, opts);
    expect(cfg.supported).toBe(false);
    expect(cfg.url).toBe('');
    expect(cfg.notes[0]).toMatch(/does not have a postback profile/i);
  });

  it('trims a trailing slash on the base URL and defaults the secret placeholder', () => {
    const cfg = buildPostbackConfig(getConnector('voluum')!, { baseUrl: 'https://api.gogobid.com/' });
    expect(cfg.url.startsWith('https://api.gogobid.com/postback/voluum?')).toBe(true);
    expect(cfg.url).toContain('secret={POSTBACK_SECRET}');
  });

  it('always includes the secret first and both required ids', () => {
    const cfg = buildPostbackConfig(getConnector('redtrack')!, opts);
    expect(cfg.fields[0].role).toBe('secret');
    const required = cfg.fields.filter((f) => f.required).map((f) => f.role).sort();
    expect(required).toEqual(['clickId', 'conversionId', 'secret']);
  });
});
