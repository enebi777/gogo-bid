import type { PrismaClient } from '@prisma/client';
import { computeCampaignMetrics } from '../../campaigns/campaign-metrics';
import { computeForecast } from '../../ai/forecast';

/**
 * Fetches a campaign's last 30 days of tracking rows, builds the daily series
 * via the shared metrics aggregator, projects the next 7 days, and persists a
 * Forecast row. Same plain-function-takes-prisma shape as the postback and
 * automation handlers, so it runs identically inside the BullMQ worker and the
 * on-demand /analyze endpoint. Returns the created Forecast (or null when the
 * campaign has too little history to project).
 */
export async function runForecast(campaignId: string, prisma: PrismaClient) {
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const [costs, revenues, clicks, conversions] = await Promise.all([
    prisma.cost.findMany({ where: { campaignId, date: { gte: from } } }),
    prisma.revenue.findMany({ where: { campaignId, date: { gte: from } } }),
    prisma.click.findMany({ where: { campaignId, createdAt: { gte: from } } }),
    prisma.conversion.findMany({ where: { campaignId, createdAt: { gte: from } } }),
  ]);

  const metrics = computeCampaignMetrics({ costs, revenues, clicks, conversions }, '30d');
  const forecast = computeForecast(metrics.series, 7);
  if (forecast.method === 'insufficient-data') return null;

  return prisma.forecast.create({
    data: { campaignId, horizon: 'weekly', metrics: forecast as any },
  });
}
