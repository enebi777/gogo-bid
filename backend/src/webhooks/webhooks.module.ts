import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
