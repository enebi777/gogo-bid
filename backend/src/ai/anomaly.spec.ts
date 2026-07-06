import { detectAnomalies, AnomalyInput } from './anomaly';

const base = (over: Partial<AnomalyInput> = {}): AnomalyInput => ({
  spend: 100,
  revenue: 300,
  roas: 3,
  cpa: 10,
  cvr: 5,
  clicks: 200,
  conversions: 10,
  source: 'live',
  targetCpa: 15,
  targetRoas: 2,
  dailyBudget: 500,
  ...over,
});

describe('detectAnomalies', () => {
  it('returns nothing when there is no live data', () => {
    expect(detectAnomalies(base({ source: 'empty' }))).toEqual([]);
  });

  it('returns nothing for a healthy campaign', () => {
    expect(detectAnomalies(base())).toEqual([]);
  });

  it('flags ROAS below break-even as critical', () => {
    const a = detectAnomalies(base({ roas: 0.65, revenue: 65, spend: 100 }));
    expect(a).toEqual([expect.objectContaining({ type: 'roas_below_breakeven', severity: 'critical', metric: 'ROAS' })]);
  });

  it('flags ROAS below target (but above break-even) as warning', () => {
    const a = detectAnomalies(base({ roas: 1.5, targetRoas: 2 }));
    expect(a).toEqual([expect.objectContaining({ type: 'roas_below_target', severity: 'warning' })]);
  });

  it('does not flag ROAS when spend is zero', () => {
    expect(detectAnomalies(base({ roas: 0, spend: 0, revenue: 0, conversions: 0, clicks: 0 }))).toEqual([]);
  });

  it('flags CPA 25%+ over target as warning and 50%+ as critical', () => {
    expect(detectAnomalies(base({ cpa: 20, targetCpa: 15 }))[0]).toMatchObject({ type: 'cpa_over_target', severity: 'warning' });
    expect(detectAnomalies(base({ cpa: 30, targetCpa: 15 }))[0]).toMatchObject({ type: 'cpa_over_target', severity: 'critical' });
  });

  it('flags spend + clicks with zero conversions as critical', () => {
    const a = detectAnomalies(base({ conversions: 0, clicks: 200, cpa: null, roas: 0, revenue: 0 }));
    expect(a).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'no_conversions', severity: 'critical' })]));
  });

  it('does not flag zero conversions below the click threshold', () => {
    const a = detectAnomalies(base({ conversions: 0, clicks: 10, cpa: null, roas: 2.5, revenue: 250 }));
    expect(a.find((x) => x.type === 'no_conversions')).toBeUndefined();
  });

  it('flags budget overshoot', () => {
    const a = detectAnomalies(base({ spend: 600, dailyBudget: 500 }));
    expect(a).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'budget_overshoot', severity: 'warning' })]));
  });

  it('can return multiple independent anomalies at once', () => {
    const a = detectAnomalies(base({ roas: 0.5, revenue: 50, spend: 600, dailyBudget: 500, cpa: 40, targetCpa: 15 }));
    const types = a.map((x) => x.type).sort();
    expect(types).toEqual(['budget_overshoot', 'cpa_over_target', 'roas_below_breakeven']);
  });
});
