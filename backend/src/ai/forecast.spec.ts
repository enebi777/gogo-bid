import { computeForecast, SeriesPoint } from './forecast';

const pt = (date: string, spend: number, revenue: number, conversions = 0): SeriesPoint => ({ date, spend, revenue, conversions });

describe('computeForecast', () => {
  it('reports insufficient-data for fewer than 2 points', () => {
    expect(computeForecast([], 7).method).toBe('insufficient-data');
    expect(computeForecast([pt('2026-07-01', 10, 20)], 7)).toMatchObject({ method: 'insufficient-data', confidence: 0, roas: null, days: [] });
  });

  it('projects a flat trend forward when the series is constant', () => {
    const series = [pt('2026-07-01', 100, 200), pt('2026-07-02', 100, 200), pt('2026-07-03', 100, 200)];
    const f = computeForecast(series, 7);
    expect(f.method).toBe('linear-regression');
    expect(f.days).toHaveLength(7);
    // constant history → each projected day ~100 spend / 200 revenue
    expect(f.days[0].spend).toBeCloseTo(100, 1);
    expect(f.days[6].revenue).toBeCloseTo(200, 1);
    expect(f.totalSpend).toBeCloseTo(700, 0);
    expect(f.totalRevenue).toBeCloseTo(1400, 0);
    expect(f.roas).toBeCloseTo(2, 2);
  });

  it('extrapolates an upward trend', () => {
    const series = [pt('2026-07-01', 100, 250), pt('2026-07-02', 110, 275), pt('2026-07-03', 120, 300), pt('2026-07-04', 130, 325)];
    const f = computeForecast(series, 3);
    // next day (x=4) spend ~140, revenue ~350
    expect(f.days[0].spend).toBeCloseTo(140, 0);
    expect(f.days[0].revenue).toBeCloseTo(350, 0);
    expect(f.days[2].spend).toBeGreaterThan(f.days[0].spend); // keeps climbing
  });

  it('clamps projections at zero for a steep downward trend', () => {
    const series = [pt('2026-07-01', 100, 100), pt('2026-07-02', 60, 60), pt('2026-07-03', 20, 20)];
    const f = computeForecast(series, 7);
    expect(f.days.every((d) => d.spend >= 0 && d.revenue >= 0)).toBe(true);
    expect(f.days[6].spend).toBe(0); // would go negative, clamped
  });

  it('gives higher confidence with a clean fit over more days', () => {
    const clean = Array.from({ length: 14 }, (_, i) => pt('d' + i, 100 + i, 200 + 2 * i));
    const noisy = [pt('d0', 100, 200), pt('d1', 300, 50), pt('d2', 50, 400)];
    expect(computeForecast(clean, 7).confidence).toBeGreaterThan(computeForecast(noisy, 7).confidence);
  });

  it('roas is null when projected spend is zero', () => {
    const series = [pt('2026-07-01', 0, 50), pt('2026-07-02', 0, 60)];
    expect(computeForecast(series, 7).roas).toBeNull();
  });
});
