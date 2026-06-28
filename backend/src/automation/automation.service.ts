import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  listRules(organizationId: string) {
    return this.prisma.automationRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRuleOrThrow(organizationId: string, id: string) {
    const rule = await this.prisma.automationRule.findFirst({ where: { id, organizationId } });
    if (!rule) throw new NotFoundException('Automation rule not found.');
    return rule;
  }

  createRule(organizationId: string, data: CreateAutomationRuleDto) {
    return this.prisma.automationRule.create({
      data: {
        organizationId,
        name: data.name,
        enabled: data.enabled ?? true,
        triggerType: data.triggerType,
        conditions: (data.conditions ?? []) as any,
        action: data.action,
        actionParams: (data.actionParams ?? null) as any,
      },
    });
  }

  async updateRule(organizationId: string, id: string, data: UpdateAutomationRuleDto) {
    await this.getRuleOrThrow(organizationId, id);
    return this.prisma.automationRule.update({
      where: { id },
      data: { ...data, conditions: data.conditions as any, actionParams: data.actionParams as any },
    });
  }

  async deleteRule(organizationId: string, id: string) {
    await this.getRuleOrThrow(organizationId, id);
    await this.prisma.automationRule.delete({ where: { id } });
    return { status: 'deleted', id };
  }

  /** Execution log — newest first, capped so the endpoint can't return unbounded history. */
  listExecutions(organizationId: string, limit = 100) {
    return this.prisma.automationExecution.findMany({
      where: { rule: { organizationId } },
      include: { rule: { select: { name: true, action: true } }, event: { select: { type: true, campaignId: true } } },
      orderBy: { executedAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }
}
