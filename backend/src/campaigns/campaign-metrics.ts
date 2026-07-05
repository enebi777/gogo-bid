// Pure campaign-metrics aggregation — no Prisma, no Nest, so it's trivially
// unit-testable and reused identically by the service. Takes already-fetched
// tracking rows (costs/revenues/clicks/conversions) plus a resolved date
// window and returns the full KPI set every Intelligence/Analytics view needs.

export type MetricsRange = 'today' | '7d' | '30d' | 'all';

/** Minimal shapes we read — kept structural so callers can pass Prisma rows or plain test objects. */
export interface CostRow {
  amount: number | { toString(): string };
  date: Date;
}
export interface RevenueRow {
  amount: number | { toString(): string };
  date: Date;
}
export interface ClickRow {
  cost: number | { toString(): string } | null;
  createdAt: Date;
}
export interface ConversionRow {
  revenue: number | { toString(): string } | null;
  payout: number | { toString(): string } | null;
  createdAt: Date;
}

export interface MetricsResult {
  range: MetricsRange;
  from: string | null; // ISO; null for 'all'
  to: string;
  // 'live' = at least one real tracking row fell in the window; 'empty' = no
  // rows, so the frontend knows to fall back to seeded/preview numbers rather
  // than showing a misleading all-zero campaign.
  source: 'live' | 'empty';
  spend: number;
  revenue: number;
  profit: number;
  roas: number | null;
  clicks: number;
  conversions: number;
  cvr: number | null; // %
  cpa: number | null;
  cpc: number | null;
  series: Array<{ date: string; spend: number; revenue: number; conversions: number }>;
}

/** Decimal | number | null → number. Prisma Decimals stringify losslessly. */
function num(v: number | { toString(): string } | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v.toString());
}

/** Resolve a range keyword to an inclusive [from, to] window. `now` is injectable for tests. */
export function resolveRange(range: MetricsRange, now: Date = new Date()): { from: Date | null; to: Date } {
  const to = now;
  if (range === 'all') return { from: null, to };
  const from = new Date(now);
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    from.setDate(from.getDate() - 7);
  } else if (range === '30d') {
    from.setDate(from.getDate() - 30);
  }
  return { from, to };
}

function inWindow(d: Date, from: Date | null, to: Date): boolean {
  if (from && d < from) return false;
  return d <= to;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeCampaignMetrics(
  rows: { costs: CostRow[]; revenues: RevenueRow[]; clicks: ClickRow[]; conversions: ConversionRow[] },
  range: MetricsRange,
  now: Date = new Date(),
): MetricsResult {
  const { from, to } = resolveRange(range, now);

  const costs = rows.costs.filter((r) => inWindow(r.date, from, to));
  const revenues = rows.revenues.filter((r) => inWindow(r.date, from, to));
  const clicks = rows.clicks.filter((r) => inWindow(r.createdAt, from, to));
  const conversions = rows.conversions.filter((r) => inWindow(r.createdAt, from, to));

  // Spend comes from Cost rows (platform ad spend); fall back to summing
  // per-click cost when no Cost rows exist but clicks carry a cost (e.g. a
  // tracker that reports cost on the click postback rather than a daily sync).
  const costFromCostRows = costs.reduce((s, c) => s + num(c.amount), 0);
  const costFromClicks = clicks.reduce((s, c) => s + num(c.cost), 0);
  const spend = costFromCostRows > 0 ? costFromCostRows : costFromClicks;

  // Revenue prefers Revenue rows; else sums conversion revenue.
  const revFromRevenueRows = revenues.reduce((s, r) => s + num(r.amount), 0);
  const revFromConversions = conversions.reduce((s, c) => s + num(c.revenue), 0);
  const revenue = revFromRevenueRows > 0 ? revFromRevenueRows : revFromConversions;

  const clickCount = clicks.length;
  const convCount = conversions.length;

  const anyData = costs.length + revenues.length + clickCount + convCount > 0;

  // Daily series for charts, keyed by ISO date, union of all row dates.
  const seriesMap = new Map<string, { spend: number; revenue: number; conversions: number }>();
  const bump = (key: string, patch: Partial<{ spend: number; revenue: number; conversions: number }>) => {
    const cur = seriesMap.get(key) || { spend: 0, revenue: 0, conversions: 0 };
    seriesMap.set(key, { spend: cur.spend + (patch.spend || 0), revenue: cur.revenue + (patch.revenue || 0), conversions: cur.conversions + (patch.conversions || 0) });
  };
  for (const c of costs) bump(dayKey(c.date), { spend: num(c.amount) });
  for (const r of revenues) bump(dayKey(r.date), { revenue: num(r.amount) });
  for (const c of conversions) bump(dayKey(c.createdAt), { revenue: revFromRevenueRows > 0 ? 0 : num(c.revenue), conversions: 1 });
  const series = [...seriesMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));

  return {
    range,
    from: from ? from.toISOString() : null,
    to: to.toISOString(),
    source: anyData ? 'live' : 'empty',
    spend,
    revenue,
    profit: revenue - spend,
    roas: spend > 0 ? revenue / spend : null,
    clicks: clickCount,
    conversions: convCount,
    cvr: clickCount > 0 ? (convCount / clickCount) * 100 : null,
    cpa: convCount > 0 ? spend / convCount : null,
    cpc: clickCount > 0 ? spend / clickCount : null,
    series,
  };
}
