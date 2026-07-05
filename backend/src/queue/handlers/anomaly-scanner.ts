import type { PrismaClient } from '@prisma/client';
import { computeCampaignMetrics } from '../../campaigns/campaign-metrics';
import { detectAnomalies } from '../../ai/anomaly';

/**
 * Scans a campaign's recent (7-day) tracking rows against the anomaly rules
 * and reconciles the result with the campaign's open Alert rows:
 *   - a newly-detected anomaly whose type isn't already open → create an Alert
 *   - an open Alert whose anomaly type is no longer detected → auto-resolve it
 * so the alert list reflects the current state instead of piling up duplicates
 * or leaving stale alerts after a campaign recovers.
 *
 * Plain function takes prisma → runs in the worker and the /analyze endpoint.
 * Returns the campaign's currently-open Alerts after reconciliation.
 */
export async function runAnomalyScan(campaignId: string, prisma: PrismaClient) {
  const from = new Date();
  from.setDate(from.getDate() - 7);

  const [campaign, costs, revenues, clicks, conversions] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.cost.findMany({ where: { campaignId, date: { gte: from } } }),
    prisma.revenue.findMany({ where: { campaignId, date: { gte: from } } }),
    prisma.click.findMany({ where: { campaignId, createdAt: { gte: from } } }),
    prisma.conversion.findMany({ where: { campaignId, createdAt: { gte: from } } }),
  ]);
  if (!campaign) return [];

  const metrics = computeCampaignMetrics({ costs, revenues, clicks, conversions }, '7d');
  // targetCpa/targetRoas live in the frontend-managed `data` JSON blob.
  const opt = ((campaign.data as any) || {}).optimization || {};
  const anomalies = detectAnomalies({
    spend: metrics.spend,
    revenue: metrics.revenue,
    roas: metrics.roas,
    cpa: metrics.cpa,
    cvr: metrics.cvr,
    clicks: metrics.clicks,
    conversions: metrics.conversions,
    source: metrics.source,
    targetCpa: opt.targetCPA ?? null,
    targetRoas: opt.targetRoas ?? null,
    dailyBudget: campaign.dailyBudget != null ? Number(campaign.dailyBudget) : null,
  });

  const open = await prisma.alert.findMany({ where: { campaignId, resolved: false } });
  const openByType = new Map(open.map((a) => [a.type, a]));
  const detectedTypes = new Set(anomalies.map((a) => a.type));

  // Create alerts for newly-detected anomaly types.
  for (const a of anomalies) {
    if (!openByType.has(a.type)) {
      await prisma.alert.create({
        data: { campaignId, type: a.type, severity: a.severity, message: a.message },
      });
    }
  }
  // Auto-resolve open alerts whose condition no longer holds.
  const stale = open.filter((a) => !detectedTypes.has(a.type)).map((a) => a.id);
  if (stale.length) {
    await prisma.alert.updateMany({ where: { id: { in: stale } }, data: { resolved: true } });
  }

  return prisma.alert.findMany({ where: { campaignId, resolved: false }, orderBy: { createdAt: 'desc' } });
}
