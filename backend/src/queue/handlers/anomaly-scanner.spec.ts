import { runAnomalyScan } from './anomaly-scanner';

// Focused on the reconciliation logic (create-new / auto-resolve-stale /
// dedup). The detection rules themselves are covered by ai/anomaly.spec.ts;
// here we drive metrics via seeded rows and assert what happens to Alert rows.

function makePrisma(opts: { rows?: any; open?: any[]; campaign?: any }) {
  const created: any[] = [];
  const resolvedIds: string[] = [];
  const finalOpen = opts.open ?? [];
  return {
    _created: created,
    _resolvedIds: resolvedIds,
    campaign: { findUnique: jest.fn().mockResolvedValue(opts.campaign ?? { id: 'c1', dailyBudget: 500, data: { optimization: { targetCPA: 15, targetRoas: 2 } } }) },
    cost: { findMany: jest.fn().mockResolvedValue(opts.rows?.costs ?? []) },
    revenue: { findMany: jest.fn().mockResolvedValue(opts.rows?.revenues ?? []) },
    click: { findMany: jest.fn().mockResolvedValue(opts.rows?.clicks ?? []) },
    conversion: { findMany: jest.fn().mockResolvedValue(opts.rows?.conversions ?? []) },
    alert: {
      findMany: jest
        .fn()
        // first call = existing open alerts; second = final open set
        .mockResolvedValueOnce(opts.open ?? [])
        .mockResolvedValue(finalOpen),
      create: jest.fn().mockImplementation(({ data }: any) => { created.push(data); return Promise.resolve(data); }),
      updateMany: jest.fn().mockImplementation(({ where }: any) => { resolvedIds.push(...where.id.in); return Promise.resolve({ count: where.id.in.length }); }),
    },
  } as any;
}

const now = new Date();
// Unprofitable rows: spend 200, revenue 100 (ROAS 0.5), 60 clicks 4 conv.
const badRows = {
  costs: [{ amount: 200, date: now }],
  revenues: [{ amount: 100, date: now }],
  clicks: Array.from({ length: 60 }, (_, i) => ({ cost: null, createdAt: now })),
  conversions: Array.from({ length: 4 }, (_, i) => ({ revenue: 25, payout: 5, createdAt: now })),
};

describe('runAnomalyScan', () => {
  it('creates alerts for newly-detected anomalies', async () => {
    const prisma = makePrisma({ rows: badRows, open: [] });
    await runAnomalyScan('c1', prisma);
    const types = prisma._created.map((a: any) => a.type).sort();
    expect(types).toContain('roas_below_breakeven');
    expect(prisma.alert.create).toHaveBeenCalled();
    expect(prisma.alert.updateMany).not.toHaveBeenCalled();
  });

  it('does not duplicate an already-open alert of the same type', async () => {
    const prisma = makePrisma({ rows: badRows, open: [{ id: 'a1', type: 'roas_below_breakeven', resolved: false }] });
    await runAnomalyScan('c1', prisma);
    const created = prisma._created.map((a: any) => a.type);
    expect(created).not.toContain('roas_below_breakeven'); // already open → skip
  });

  it('auto-resolves an open alert whose condition no longer holds', async () => {
    // Healthy rows now, but a stale ROAS alert is still open.
    const healthy = { costs: [{ amount: 100, date: now }], revenues: [{ amount: 400, date: now }], clicks: [], conversions: [{ revenue: 400, payout: 100, createdAt: now }] };
    const prisma = makePrisma({ rows: healthy, open: [{ id: 'a1', type: 'roas_below_breakeven', resolved: false }] });
    await runAnomalyScan('c1', prisma);
    expect(prisma._resolvedIds).toContain('a1');
  });

  it('returns [] and does nothing when the campaign is missing', async () => {
    const prisma = makePrisma({ rows: badRows });
    prisma.campaign.findUnique.mockResolvedValue(null);
    const res = await runAnomalyScan('missing', prisma);
    expect(res).toEqual([]);
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });
});
