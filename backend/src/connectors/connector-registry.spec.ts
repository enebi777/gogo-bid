import { CONNECTORS, listConnectors, getConnector, getConnectorByProvider, connectorsByType, getProfile, getTrackerFields } from './connector-registry';
import { ConnectionType } from './connector-types';

const VALID_TYPES: ConnectionType[] = ['oauth', 'api', 'tracking', 'affiliate', 'webhook', 'destination', 'ai'];

describe('connector registry — well-formedness', () => {
  it('has unique ids and unique non-null providers', () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const providers = CONNECTORS.map((c) => c.provider).filter(Boolean);
    expect(new Set(providers).size).toBe(providers.length);
  });

  it('every connector has a valid connection type, category, name and capability flags', () => {
    for (const c of CONNECTORS) {
      expect(VALID_TYPES).toContain(c.connectionType);
      expect(c.name).toBeTruthy();
      expect(c.category).toBeTruthy();
      expect(c.authProvider).toBeTruthy();
      // capabilities must be a complete boolean record
      for (const k of ['multiAccount', 'assetDiscovery', 'campaignImport', 'webhooks', 'postbacks', 'automation', 'ai']) {
        expect(typeof (c.capabilities as any)[k]).toBe('boolean');
      }
    }
  });

  it('slugs are url-safe (lowercase, no spaces)', () => {
    for (const c of CONNECTORS) expect(c.id).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('connector registry — capability invariants', () => {
  it('OAuth ad connectors support multi-account, asset discovery and campaign import', () => {
    for (const c of connectorsByType('oauth')) {
      expect(c.capabilities.multiAccount).toBe(true);
      expect(c.capabilities.assetDiscovery).toBe(true);
      expect(c.capabilities.campaignImport).toBe(true);
    }
  });

  it('tracking and affiliate connectors accept postbacks', () => {
    for (const c of [...connectorsByType('tracking'), ...connectorsByType('affiliate')]) {
      expect(c.capabilities.postbacks).toBe(true);
    }
  });

  it('every tracking connector carries a postback profile', () => {
    for (const c of connectorsByType('tracking')) {
      expect(c.profile).toBeDefined();
      expect(c.profile!.clickIdParam).toBeTruthy();
      expect(c.profile!.conversionIdParam).toBeTruthy();
    }
  });
});

describe('connector registry — lookups', () => {
  it('getConnector / getConnectorByProvider resolve', () => {
    expect(getConnector('meta_ads')?.provider).toBe('META_ADS');
    expect(getConnectorByProvider('META_ADS')?.id).toBe('meta_ads');
    expect(getConnector('nope')).toBeUndefined();
  });

  it('listConnectors sorts by priority and filters by type', () => {
    const all = listConnectors();
    const prios = all.map((c) => c.priority);
    expect(prios).toEqual([...prios].sort((a, b) => a - b));
    expect(listConnectors('destination').every((c) => c.connectionType === 'destination')).toBe(true);
  });

  it('getProfile returns the smart profile for a tracker/affiliate', () => {
    expect(getProfile('voluum')).toMatchObject({ clickIdParam: 'cid', conversionIdParam: 'txid' });
    expect(getProfile('clickbank')).toMatchObject({ clickIdParam: 'tid', conversionIdParam: 'cbreceipt', revenueParam: 'amount' });
  });
});

describe('getTrackerFields — preserves the pre-refactor TRACKER_FIELD_MAP', () => {
  // These are the exact mappings the postback adapter relied on before the
  // registry became the source of truth. Locking them prevents a silent
  // regression in conversion attribution.
  it.each([
    ['voluum', 'cid', 'txid'],
    ['redtrack', 'clickid', 'conversion_id'],
    ['binom', 'click_id', 'tx_id'],
    ['bemob', 'click_id', 'payout_id'],
    ['keitaro', 'subid', 'tid'],
    ['hyros', 'click_id', 'order_id'],
  ])('%s → clickId=%s conversionId=%s', (slug, clickId, conversionId) => {
    expect(getTrackerFields(slug)).toEqual({ clickId, conversionId });
  });

  it('returns undefined for a tracker with no profile', () => {
    expect(getTrackerFields('unknown-tracker')).toBeUndefined();
  });
});
