import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { AutomationService } from './automation.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

@UseGuards(JwtAuthGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('rules')
  listRules(@Req() req: any) {
    return this.automation.listRules(req.user.organizationId);
  }

  @Post('rules')
  createRule(@Req() req: any, @Body() body: CreateAutomationRuleDto) {
    return this.automation.createRule(req.user.organizationId, body);
  }

  @Patch('rules/:id')
  updateRule(@Req() req: any, @Param('id') id: string, @Body() body: UpdateAutomationRuleDto) {
    return this.automation.updateRule(req.user.organizationId, id, body);
  }

  // Deleting a rule removes a standing automation policy org-wide — same
  // OWNER/ADMIN bar as deleting a campaign or repointing an integration.
  @Delete('rules/:id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  deleteRule(@Req() req: any, @Param('id') id: string) {
    return this.automation.deleteRule(req.user.organizationId, id);
  }

  @Get('executions')
  listExecutions(@Req() req: any, @Query('limit') limit?: string) {
    return this.automation.listExecutions(req.user.organizationId, limit ? parseInt(limit, 10) : undefined);
  }
}
