import { Body, Controller, Get, Param, Patch, Query, Req, Res, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { MetaAdapter } from './adapters/meta.adapter';
import { GoogleAdsAdapter } from './adapters/google-ads.adapter';
import { TikTokAdsAdapter } from './adapters/tiktok-ads.adapter';

const ADAPTERS: Record<string, any> = {
  meta: { adapter: MetaAdapter, provider: 'META_ADS' },
  google: { adapter: GoogleAdsAdapter, provider: 'GOOGLE_ADS' },
  tiktok: { adapter: TikTokAdsAdapter, provider: 'TIKTOK_ADS' },
};

@Controller('oauth')
export class IntegrationsController {
  constructor(private readonly prisma: PrismaService, private readonly encryption: EncryptionService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':provider/connect')
  connect(@Param('provider') provider: string, @Req() req: any, @Res() res: Response) {
    const entry = ADAPTERS[provider];
    if (!entry) throw new BadRequestException(`Unknown provider "${provider}"`);
    const adapter = new entry.adapter();
    // state encodes the org id (signed in a real impl — keep it simple here)
    const state = `${req.user.organizationId}.${randomBytes(8).toString('hex')}`;
    return res.redirect(adapter.getAuthorizationUrl(state));
  }

  @Get(':provider/callback')
  async callback(@Param('provider') provider: string, @Query('code') code: string, @Query('state') state: string) {
    const entry = ADAPTERS[provider];
    if (!entry) throw new BadRequestException(`Unknown provider "${provider}"`);
    const [organizationId] = (state ?? '').split('.');
    if (!organizationId) throw new BadRequestException('Missing or malformed OAuth state.');

    const adapter = new entry.adapter();
    const result = await adapter.exchangeCodeForToken(code);

    // Google Ads has no single "account" returned by the token exchange —
    // the same Google identity can manage multiple ad accounts (customer
    // IDs), so we list them and let the user pick one before sync can run.
    let externalAccountId = result.accountId ?? 'pending';
    let availableCustomers: string[] | undefined;
    if (provider === 'google' && result.refreshToken) {
      availableCustomers = await adapter.listAccessibleCustomers(result.accessToken, result.refreshToken);
      externalAccountId = availableCustomers[0] ?? 'pending';
    }

    const account = await this.prisma.integrationAccount.create({
      data: {
        organizationId,
        provider: entry.provider,
        externalAccountId,
        accessTokenEnc: this.encryption.encrypt(result.accessToken),
        refreshTokenEnc: result.refreshToken ? this.encryption.encrypt(result.refreshToken) : null,
        tokenExpiresAt: result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : null,
        status: externalAccountId === 'pending' ? 'ERROR' : 'CONNECTED',
        metadata: availableCustomers ? { availableCustomers } : undefined,
      },
    });

    return {
      status: account.status === 'CONNECTED' ? 'connected' : 'needs_account_selection',
      integrationAccountId: account.id,
      availableCustomers,
    };
  }

  /** Google Ads only: switch which customer (ad account) this connection syncs. */
  @UseGuards(JwtAuthGuard)
  @Patch('google/:integrationAccountId/select-customer')
  async selectGoogleCustomer(
    @Req() req: any,
    @Param('integrationAccountId') integrationAccountId: string,
    @Body() body: { customerId: string },
  ) {
    const account = await this.prisma.integrationAccount.findFirst({
      where: { id: integrationAccountId, organizationId: req.user.organizationId, provider: 'GOOGLE_ADS' },
    });
    if (!account) throw new NotFoundException('Google Ads integration account not found.');

    const available = (account.metadata as any)?.availableCustomers as string[] | undefined;
    if (available && !available.includes(body.customerId)) {
      throw new BadRequestException(`Customer ${body.customerId} is not accessible on this connection. Available: ${available.join(', ')}`);
    }

    return this.prisma.integrationAccount.update({
      where: { id: account.id },
      data: { externalAccountId: body.customerId, status: 'CONNECTED' },
    });
  }
}
