import { Body, Controller, Get, Headers, Post, Query, BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

/**
 * Meta and TikTok both push webhooks for ad-account/campaign changes
 * (separate from the polled Insights API sync). Verify the signature
 * header before trusting the payload — never process unverified webhooks.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly prisma: PrismaService, private readonly queue: QueueService) {}

  // Meta requires a GET verification handshake when you register the webhook.
  @Get('meta')
  verifyMeta(@Query() query: Record<string, string>) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WEBHOOK_META_VERIFY_TOKEN) {
      return challenge;
    }
    throw new BadRequestException('Webhook verification failed.');
  }

  @Post('meta')
  async receiveMeta(@Headers('x-hub-signature-256') signature: string, @Body() body: any) {
    // NOTE: signature must be computed over the exact raw request bytes, not
    // a re-serialization of the parsed body. Wire a raw-body middleware
    // (e.g. express.raw() on this route) before relying on this in production.
    const valid = this.verifyMetaSignature(signature, JSON.stringify(body));
    const event = await this.prisma.webhookEvent.create({
      data: { provider: 'META_ADS', signatureValid: valid, payload: body, status: valid ? 'RECEIVED' : 'FAILED' },
    });
    if (!valid) throw new BadRequestException('Invalid Meta webhook signature.');
    await this.queue.enqueueWebhookProcessing(event.id);
    return { status: 'accepted' };
  }

  @Post('tiktok')
  async receiveTikTok(@Headers('authorization') authHeader: string, @Body() body: any) {
    const valid = authHeader === `Bearer ${process.env.WEBHOOK_TIKTOK_VERIFY_TOKEN}`;
    const event = await this.prisma.webhookEvent.create({
      data: { provider: 'TIKTOK_ADS', signatureValid: valid, payload: body, status: valid ? 'RECEIVED' : 'FAILED' },
    });
    if (!valid) throw new BadRequestException('Invalid TikTok webhook token.');
    await this.queue.enqueueWebhookProcessing(event.id);
    return { status: 'accepted' };
  }

  private verifyMetaSignature(signatureHeader: string | undefined, rawBody: string): boolean {
    if (!signatureHeader || !process.env.META_APP_SECRET) return false;
    const expected = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
