import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

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
