// Pure anomaly detection — no Prisma/Nest. Applies a small set of explicit,
// explainable threshold rules to a campaign's real computed metrics (from
// computeCampaignMetrics) plus optional targets from the campaign config.
// Each rule returns a typed finding the caller persists as an Alert row.
// Deliberately rule-based, not ML: every alert can point at exactly why it
// fired, which is what an operator needs when deciding whether to act.

export interface AnomalyInput {
  // Current-window KPIs (typically the 'today' or '7d' MetricsResult).
  spend: number;
  revenue: number;
  roas: number | null;
  cpa: number | null;
  cvr: number | null;
  clicks: number;
  conversions: number;
  source: 'live' | 'empty';
  // Optional per-campaign targets (from the campaign's optimization config).
  targetCpa?: number | null;
  targetRoas?: number | null;
  dailyBudget?: number | null;
  // The platform's minimum viable daily budget (from the connector registry's
  // budgetGuidance). Used to flag under-funded campaigns — a config issue that
  // holds regardless of whether tracking data exists yet.
  minDailyBudget?: number | null;
}

export type AnomalySeverity = 'critical' | 'warning' | 'info';
export interface Anomaly {
  type: string; // stable key → Alert.type (used for dedup)
  metric: string; // human label
  severity: AnomalySeverity;
  message: string;
}

const money = (v: number) => '$' + (Math.round(v * 100) / 100).toLocaleString('en-US');
const x = (v: number) => (Math.round(v * 100) / 100).toFixed(2) + '×';

/**
 * Returns anomalies for a single campaign window. Empty array = healthy (or no
 * data). Rules are intentionally conservative so alerts stay actionable.
 */
export function detectAnomalies(m: AnomalyInput): Anomaly[] {
  const out: Anomaly[] = [];

  // 0) Under-funded: configured daily budget below the platform's viable floor.
  // This is a configuration check, not a performance one, so it's evaluated
  // regardless of whether live tracking data exists — an under-funded campaign
  // can't gather meaningful data for the algorithm to optimize on.
  if (m.minDailyBudget != null && m.minDailyBudget > 0 && m.dailyBudget != null && m.dailyBudget > 0 && m.dailyBudget < m.minDailyBudget) {
    out.push({
      type: 'under_min_budget',
      metric: 'Budget',
      severity: 'warning',
      message: `Daily budget ${money(m.dailyBudget)} is below the ~${money(m.minDailyBudget)} minimum this platform needs to gather meaningful data.`,
    });
  }

  // No real data → nothing further to assert. (The caller keeps seeded preview.)
  if (m.source !== 'live') return out;

  // 1) Unprofitable spend: ROAS below break-even while actually spending.
  if (m.roas != null && m.spend > 0 && m.roas < 1) {
    out.push({
      type: 'roas_below_breakeven',
      metric: 'ROAS',
      severity: 'critical',
      message: `ROAS ${x(m.roas)} — spending ${money(m.spend)} to earn ${money(m.revenue)}. Campaign is losing money.`,
    });
  } else if (m.targetRoas != null && m.roas != null && m.spend > 0 && m.roas < m.targetRoas) {
    out.push({
      type: 'roas_below_target',
      metric: 'ROAS',
      severity: 'warning',
      message: `ROAS ${x(m.roas)} is below the ${x(m.targetRoas)} target.`,
    });
  }

  // 2) CPA overshooting target.
  if (m.targetCpa != null && m.cpa != null && m.cpa > m.targetCpa * 1.25) {
    out.push({
      type: 'cpa_over_target',
      metric: 'CPA',
      severity: m.cpa > m.targetCpa * 1.5 ? 'critical' : 'warning',
      message: `CPA ${money(m.cpa)} is ${Math.round((m.cpa / m.targetCpa - 1) * 100)}% over the ${money(m.targetCpa)} target.`,
    });
  }

  // 3) Spend with clicks but zero conversions (tracking break or dead offer).
  if (m.spend > 0 && m.clicks >= 50 && m.conversions === 0) {
    out.push({
      type: 'no_conversions',
      metric: 'CVR',
      severity: 'critical',
      message: `${m.clicks.toLocaleString()} clicks and ${money(m.spend)} spent with 0 conversions — check tracking/postbacks or the offer.`,
    });
  }

  // 4) Budget overshoot: window spend already past the configured daily budget.
  if (m.dailyBudget != null && m.dailyBudget > 0 && m.spend > m.dailyBudget) {
    out.push({
      type: 'budget_overshoot',
      metric: 'Spend',
      severity: 'warning',
      message: `Spend ${money(m.spend)} has exceeded the ${money(m.dailyBudget)} daily budget.`,
    });
  }

  return out;
}
