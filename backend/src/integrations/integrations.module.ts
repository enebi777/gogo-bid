import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { EncryptionService } from '../common/encryption.service';

@Module({
  controllers: [IntegrationsController],
  providers: [EncryptionService],
})
export class IntegrationsModule {}
