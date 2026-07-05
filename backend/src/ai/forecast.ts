// Pure forecasting — no Prisma/Nest. Projects the next `horizonDays` of
// spend/revenue from a campaign's daily series using ordinary least-squares
// linear regression per metric (clamped at zero — spend/revenue can't go
// negative). Deliberately simple and explainable rather than a black box:
// the point of this first real pipeline is to replace the seeded numbers
// with something derived from the campaign's own history, with an honest
// confidence signal, not to be a state-of-the-art model.

export interface SeriesPoint {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
}

export interface ForecastMetrics {
  method: 'linear-regression' | 'insufficient-data';
  horizonDays: number;
  pointsUsed: number;
  confidence: number; // 0–100
  days: Array<{ day: number; spend: number; revenue: number; profit: number }>;
  totalSpend: number;
  totalRevenue: number;
  totalProfit: number;
  roas: number | null;
}

/** Ordinary least squares slope/intercept for points (x=0..n-1, y). */
function linreg(y: number[]): { slope: number; intercept: number; r2: number } {
  const n = y.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  if (n === 1) return { slope: 0, intercept: y[0], r2: 0 };
  const xs = y.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (y[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  // R² as a fit-quality signal feeding confidence.
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function computeForecast(series: SeriesPoint[], horizonDays = 7): ForecastMetrics {
  const points = series.length;
  if (points < 2) {
    // Can't fit a trend from a single day (or none) — say so honestly rather
    // than emitting a fake projection.
    return {
      method: 'insufficient-data',
      horizonDays,
      pointsUsed: points,
      confidence: 0,
      days: [],
      totalSpend: 0,
      totalRevenue: 0,
      totalProfit: 0,
      roas: null,
    };
  }

  const spend = linreg(series.map((p) => p.spend));
  const revenue = linreg(series.map((p) => p.revenue));

  const days: ForecastMetrics['days'] = [];
  let totalSpend = 0;
  let totalRevenue = 0;
  for (let d = 1; d <= horizonDays; d++) {
    const x = points - 1 + d; // continue the trend past the last observed day
    const s = Math.max(0, spend.intercept + spend.slope * x);
    const r = Math.max(0, revenue.intercept + revenue.slope * x);
    totalSpend += s;
    totalRevenue += r;
    days.push({ day: d, spend: round2(s), revenue: round2(r), profit: round2(r - s) });
  }

  // Confidence blends fit quality (avg R² of the two regressions) with a
  // sample-size factor — a great fit on 3 days shouldn't read as high-confidence.
  const fit = (spend.r2 + revenue.r2) / 2;
  const sampleFactor = Math.min(1, points / 14); // saturates at ~2 weeks of data
  const confidence = Math.round(fit * sampleFactor * 100);

  return {
    method: 'linear-regression',
    horizonDays,
    pointsUsed: points,
    confidence,
    days,
    totalSpend: round2(totalSpend),
    totalRevenue: round2(totalRevenue),
    totalProfit: round2(totalRevenue - totalSpend),
    roas: totalSpend > 0 ? round2(totalRevenue / totalSpend) : null,
  };
}
