import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller';

@Module({
  controllers: [ConnectorsController],
})
export class ConnectorsModule {}
