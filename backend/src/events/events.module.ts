import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
