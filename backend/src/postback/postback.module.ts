import { Module } from '@nestjs/common';
import { PostbackController } from './postback.controller';
import { GenericTrackerAdapter } from '../integrations/adapters/tracker.adapter';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [PostbackController],
  providers: [GenericTrackerAdapter],
})
export class PostbackModule {}
