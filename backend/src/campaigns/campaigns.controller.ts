import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@Req() req: any) {
    return this.campaigns.list(req.user.organizationId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.campaigns.getOrThrow(req.user.organizationId, id);
  }

  @Get(':id/performance')
  performance(@Req() req: any, @Param('id') id: string) {
    return this.campaigns.performance(req.user.organizationId, id);
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateCampaignDto) {
    return this.campaigns.create(req.user.organizationId, body);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateCampaignDto) {
    return this.campaigns.update(req.user.organizationId, id, body);
  }

  // Archiving/deleting a campaign affects spend/reporting org-wide, so we
  // restrict it to OWNER/ADMIN rather than any authenticated MEMBER/VIEWER.
  @Patch(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  archive(@Req() req: any, @Param('id') id: string) {
    return this.campaigns.archive(req.user.organizationId, id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  delete(@Req() req: any, @Param('id') id: string) {
    return this.campaigns.delete(req.user.organizationId, id);
  }
}
