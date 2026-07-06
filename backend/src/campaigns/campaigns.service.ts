import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { computeCampaignMetrics, resolveRange, MetricsRange } from './campaign-metrics';
import { runForecast } from '../queue/handlers/forecast-runner';
import { runAnomalyScan } from '../queue/handlers/anomaly-scanner';
import { getConnector, getConnectorByProvider } from '../connectors/connector-registry';
import { buildPostbackConfig } from '../connectors/auto-config';
import { buildTrackingSnippet } from '../connectors/tracking-snippet';

const VALID_RANGES: MetricsRange[] = ['today', '7d', '30d', 'all'];

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  list(organizationId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId },
      include: { offer: true, integrationAccount: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrThrow(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: { offer: true, integrationAccount: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    return campaign;
  }

  /**
   * Aggregates cost/revenue/click/conversion data for a single campaign.
   * Every Intelligence/AI Tools/Analytics module should call this (or the
   * equivalent campaign-scoped query) instead of re-deriving its own view of
   * "current campaign" — this is what makes campaign switching propagate
   * everywhere automatically.
   */
  async performance(organizationId: string, id: string) {
    const campaign = await this.getOrThrow(organizationId, id);
    const [costs, revenues, clicks, conversions] = await Promise.all([
      this.prisma.cost.findMany({ where: { campaignId: id } }),
      this.prisma.revenue.findMany({ where: { campaignId: id } }),
      this.prisma.click.count({ where: { campaignId: id } }),
      this.prisma.conversion.findMany({ where: { campaignId: id } }),
    ]);

    const spend = costs.reduce((s, c) => s + Number(c.amount), 0);
    const revenue = revenues.reduce((s, r) => s + Number(r.amount), 0);
    const conversionCount = conversions.length;

    return {
      campaign,
      spend,
      revenue,
      profit: revenue - spend,
      roas: spend > 0 ? revenue / spend : null,
      clicks,
      conversions: conversionCount,
      cvr: clicks > 0 ? (conversionCount / clicks) * 100 : null,
      cpa: conversionCount > 0 ? spend / conversionCount : null,
    };
  }

  /**
   * Range-aware live metrics computed from real tracking rows. Unlike
   * performance() (lifetime totals), this powers the campaign-scoped views
   * that need windowed KPIs + a daily series, and flags `source: 'empty'`
   * so the frontend can fall back to seeded preview numbers on a campaign
   * with no tracking data yet rather than showing a misleading all-zero card.
   */
  async metrics(organizationId: string, id: string, rangeParam?: string) {
    await this.getOrThrow(organizationId, id);
    const range: MetricsRange = VALID_RANGES.includes(rangeParam as MetricsRange) ? (rangeParam as MetricsRange) : '7d';
    const { from } = resolveRange(range);
    // Only pull rows inside the window (or all, for range='all') so a
    // long-running campaign doesn't load its full history every request.
    const dateFilter = from ? { gte: from } : undefined;
    const [costs, revenues, clicks, conversions] = await Promise.all([
      this.prisma.cost.findMany({ where: { campaignId: id, ...(dateFilter ? { date: dateFilter } : {}) } }),
      this.prisma.revenue.findMany({ where: { campaignId: id, ...(dateFilter ? { date: dateFilter } : {}) } }),
      this.prisma.click.findMany({ where: { campaignId: id, ...(dateFilter ? { createdAt: dateFilter } : {}) } }),
      this.prisma.conversion.findMany({ where: { campaignId: id, ...(dateFilter ? { createdAt: dateFilter } : {}) } }),
    ]);
    return computeCampaignMetrics({ costs, revenues, clicks, conversions }, range);
  }

  /** Latest persisted forecast for a campaign (null if none generated yet). */
  async latestForecast(organizationId: string, id: string) {
    await this.getOrThrow(organizationId, id);
    return this.prisma.forecast.findFirst({ where: { campaignId: id }, orderBy: { generatedAt: 'desc' } });
  }

  /** Currently-open (unresolved) alerts for a campaign, newest first. */
  async openAlerts(organizationId: string, id: string) {
    await this.getOrThrow(organizationId, id);
    return this.prisma.alert.findMany({ where: { campaignId: id, resolved: false }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Runs the forecast + anomaly-scan handlers inline (the same code the BullMQ
   * AI worker runs) and returns fresh results. On-demand so the frontend AI
   * pages can trigger analysis and immediately show real output rather than
   * waiting for a scheduled job.
   */
  async analyze(organizationId: string, id: string) {
    await this.getOrThrow(organizationId, id);
    const [forecast, alerts] = await Promise.all([
      runForecast(id, this.prisma as any),
      runAnomalyScan(id, this.prisma as any),
    ]);
    return { forecast, alerts };
  }

  /**
   * Copy-paste website/landing-page tracking snippet for a campaign. Resolves
   * the campaign's tracker (from data.integration.trackerName, else the linked
   * integration account, defaulting to Voluum's shape) to build the conversion
   * postback template the snippet reports through — reusing the existing
   * /postback/:tracker pipeline, so no new ingest endpoint or schema is needed.
   */
  async trackingSnippet(organizationId: string, id: string) {
    const campaign = await this.getOrThrow(organizationId, id);

    // Resolve which tracker this campaign posts back through.
    const trackerName = ((campaign.data as any)?.integration?.trackerName ?? '').toString().toLowerCase();
    let connector = trackerName ? getConnector(trackerName) : undefined;
    if (!connector && campaign.integrationAccount) connector = getConnectorByProvider((campaign.integrationAccount as any).provider);
    // Fall back to a generic tracker shape so the snippet is always usable.
    const trackerConnector = connector?.capabilities.postbacks && connector.profile ? connector : getConnector('voluum')!;

    const baseUrl = process.env.POSTBACK_PUBLIC_URL || 'https://api.your-gogobid-domain.com';
    const postback = buildPostbackConfig(trackerConnector, { baseUrl });
    const snippet = buildTrackingSnippet(id, postback.url, {
      extraClickParams: trackerConnector.profile ? [trackerConnector.profile.clickIdParam] : [],
    });

    return {
      campaignId: id,
      tracker: { id: trackerConnector.id, name: trackerConnector.name, confidence: trackerConnector.profile?.confidence ?? 'generic' },
      capabilities: snippet.capabilities,
      clickIdParams: snippet.clickIdParams,
      snippet: snippet.js,
      conversionPostbackUrl: `${postback.url}&campaign_id=${id}`,
    };
  }

  async create(organizationId: string, data: { name: string; offerId?: string; dailyBudget?: number; integrationAccountId?: string; status?: string; data?: any }) {
    const campaign = await this.prisma.campaign.create({ data: { organizationId, ...data } });
    await this.events.emit({
      organizationId,
      type: 'campaign.created',
      campaignId: campaign.id,
      payload: { name: campaign.name, status: campaign.status, dailyBudget: campaign.dailyBudget },
    });
    return campaign;
  }

  async update(organizationId: string, id: string, data: Partial<{ name: string; status: string; dailyBudget: number; data: any }>) {
    const before = await this.getOrThrow(organizationId, id); // throws 404 if this org doesn't own the campaign
    const campaign = await this.prisma.campaign.update({ where: { id }, data });

    if (data.status === 'paused' && before.status !== 'paused') {
      await this.events.emit({
        organizationId,
        type: 'campaign.paused',
        campaignId: campaign.id,
        payload: { name: campaign.name, previousStatus: before.status },
      });
    }

    return campaign;
  }

  async archive(organizationId: string, id: string) {
    await this.getOrThrow(organizationId, id);
    return this.prisma.campaign.update({ where: { id }, data: { status: 'archived' } });
  }

  async delete(organizationId: string, id: string) {
    await this.getOrThrow(organizationId, id);
    await this.prisma.campaign.delete({ where: { id } });
    return { status: 'deleted', id };
  }
}
