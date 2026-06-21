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

    // Neither Google nor Meta's token exchange returns a single "account" —
    // the same identity can manage multiple ad accounts, so we list them and
    // let the user pick one before sync can run. TikTok's exchange does
    // return an advertiser_id directly (see TikTokAdsAdapter), so it skips this.
    let externalAccountId = result.accountId ?? 'pending';
    let availableAccounts: { id: string; name?: string }[] | undefined;

    if (provider === 'google' && result.refreshToken) {
      const customerIds: string[] = await adapter.listAccessibleCustomers(result.accessToken, result.refreshToken);
      availableAccounts = customerIds.map((id) => ({ id }));
      externalAccountId = customerIds[0] ?? 'pending';
    }
    if (provider === 'meta') {
      availableAccounts = await adapter.listAccessibleAdAccounts(result.accessToken);
      externalAccountId = availableAccounts[0]?.id ?? 'pending';
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
        metadata: availableAccounts ? { availableAccounts } : undefined,
      },
    });

    return {
      status: account.status === 'CONNECTED' ? 'connected' : 'needs_account_selection',
      integrationAccountId: account.id,
      availableAccounts,
    };
  }

  /** Google Ads / Meta Ads: switch which ad account this connection syncs. */
  @UseGuards(JwtAuthGuard)
  @Patch(':provider/:integrationAccountId/select-account')
  async selectAccount(
    @Req() req: any,
    @Param('provider') provider: string,
    @Param('integrationAccountId') integrationAccountId: string,
    @Body() body: { accountId: string },
  ) {
    const entry = ADAPTERS[provider];
    if (!entry) throw new BadRequestException(`Unknown provider "${provider}"`);

    const account = await this.prisma.integrationAccount.findFirst({
      where: { id: integrationAccountId, organizationId: req.user.organizationId, provider: entry.provider },
    });
    if (!account) throw new NotFoundException(`${entry.provider} integration account not found.`);

    const available = (account.metadata as any)?.availableAccounts as { id: string }[] | undefined;
    if (available && !available.some((a) => a.id === body.accountId)) {
      throw new BadRequestException(
        `Account ${body.accountId} is not accessible on this connection. Available: ${available.map((a) => a.id).join(', ')}`,
      );
    }

    return this.prisma.integrationAccount.update({
      where: { id: account.id },
      data: { externalAccountId: body.accountId, status: 'CONNECTED' },
    });
  }
}
