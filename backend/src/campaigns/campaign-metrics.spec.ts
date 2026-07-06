import { computeCampaignMetrics, resolveRange } from './campaign-metrics';

const NOW = new Date('2026-07-05T12:00:00.000Z');
const d = (iso: string) => new Date(iso);

function empty() {
  return { costs: [], revenues: [], clicks: [], conversions: [] };
}

describe('resolveRange', () => {
  it('returns null from for "all"', () => {
    expect(resolveRange('all', NOW).from).toBeNull();
  });
  it('"today" starts at local midnight', () => {
    const { from } = resolveRange('today', NOW);
    expect(from!.getHours()).toBe(0);
    expect(from!.getMinutes()).toBe(0);
  });
  it('"7d" goes back seven days', () => {
    const { from } = resolveRange('7d', NOW);
    expect(Math.round((NOW.getTime() - from!.getTime()) / 86400000)).toBe(7);
  });
});

describe('computeCampaignMetrics', () => {
  it('flags empty source and null ratios when there is no data', () => {
    const r = computeCampaignMetrics(empty(), 'all', NOW);
    expect(r.source).toBe('empty');
    expect(r).toMatchObject({ spend: 0, revenue: 0, profit: 0, roas: null, cpa: null, cpc: null, cvr: null, clicks: 0, conversions: 0 });
    expect(r.series).toEqual([]);
  });

  it('computes spend/revenue/profit/roas/cpa/cpc/cvr from real rows', () => {
    const r = computeCampaignMetrics(
      {
        costs: [{ amount: 100, date: d('2026-07-04T10:00:00Z') }],
        revenues: [{ amount: 250, date: d('2026-07-04T11:00:00Z') }],
        clicks: [
          { cost: null, createdAt: d('2026-07-04T10:00:00Z') },
          { cost: null, createdAt: d('2026-07-04T10:05:00Z') },
          { cost: null, createdAt: d('2026-07-04T10:10:00Z') },
          { cost: null, createdAt: d('2026-07-04T10:15:00Z') },
        ],
        conversions: [
          { revenue: 125, payout: 50, createdAt: d('2026-07-04T11:00:00Z') },
          { revenue: 125, payout: 50, createdAt: d('2026-07-04T11:30:00Z') },
        ],
      },
      '7d',
      NOW,
    );
    expect(r.source).toBe('live');
    expect(r.spend).toBe(100);
    expect(r.revenue).toBe(250);
    expect(r.profit).toBe(150);
    expect(r.roas).toBe(2.5);
    expect(r.clicks).toBe(4);
    expect(r.conversions).toBe(2);
    expect(r.cvr).toBe(50); // 2/4
    expect(r.cpa).toBe(50); // 100/2
    expect(r.cpc).toBe(25); // 100/4
  });

  it('excludes rows outside the range window', () => {
    const rows = {
      costs: [
        { amount: 10, date: d('2026-07-04T10:00:00Z') }, // in 7d
        { amount: 999, date: d('2026-01-01T10:00:00Z') }, // way out
      ],
      revenues: [],
      clicks: [],
      conversions: [],
    };
    expect(computeCampaignMetrics(rows, '7d', NOW).spend).toBe(10);
    expect(computeCampaignMetrics(rows, 'all', NOW).spend).toBe(1009);
  });

  it('falls back to per-click cost when no Cost rows exist', () => {
    const r = computeCampaignMetrics(
      { costs: [], revenues: [], clicks: [{ cost: 2, createdAt: d('2026-07-04T10:00:00Z') }, { cost: 3, createdAt: d('2026-07-04T10:01:00Z') }], conversions: [] },
      '7d',
      NOW,
    );
    expect(r.spend).toBe(5);
    expect(r.cpc).toBe(2.5);
  });

  it('falls back to conversion revenue when no Revenue rows exist', () => {
    const r = computeCampaignMetrics(
      { costs: [{ amount: 40, date: d('2026-07-04T10:00:00Z') }], revenues: [], clicks: [], conversions: [{ revenue: 60, payout: 20, createdAt: d('2026-07-04T11:00:00Z') }] },
      '7d',
      NOW,
    );
    expect(r.revenue).toBe(60);
    expect(r.roas).toBe(1.5);
  });

  it('handles Prisma Decimal-like objects (toString) not just numbers', () => {
    const dec = (n: number) => ({ toString: () => String(n) });
    const r = computeCampaignMetrics(
      { costs: [{ amount: dec(100), date: d('2026-07-04T10:00:00Z') }], revenues: [{ amount: dec(300), date: d('2026-07-04T10:00:00Z') }], clicks: [], conversions: [] },
      '7d',
      NOW,
    );
    expect(r.spend).toBe(100);
    expect(r.revenue).toBe(300);
    expect(r.roas).toBe(3);
  });

  it('builds a sorted daily series', () => {
    const r = computeCampaignMetrics(
      {
        costs: [
          { amount: 10, date: d('2026-07-04T10:00:00Z') },
          { amount: 20, date: d('2026-07-03T10:00:00Z') },
        ],
        revenues: [{ amount: 50, date: d('2026-07-04T10:00:00Z') }],
        clicks: [],
        conversions: [{ revenue: 50, payout: 10, createdAt: d('2026-07-04T12:00:00Z') }],
      },
      'all',
      NOW,
    );
    expect(r.series.map((s) => s.date)).toEqual(['2026-07-03', '2026-07-04']);
    expect(r.series[1]).toEqual({ date: '2026-07-04', spend: 10, revenue: 50, conversions: 1 });
    // conversion revenue not double-counted when Revenue rows exist
    expect(r.series[1].revenue).toBe(50);
  });
});
