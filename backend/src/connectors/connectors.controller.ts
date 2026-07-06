import { Controller, Get, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { listConnectors, getConnector } from './connector-registry';
import { ConnectionType } from './connector-types';

const VALID_TYPES: ConnectionType[] = ['oauth', 'api', 'tracking', 'affiliate', 'webhook', 'destination', 'ai'];

/**
 * Read-only connector catalog. The frontend renders the integration directory
 * from this single source instead of a hardcoded provider list, so new
 * connectors appear in the UI the moment they're added to the registry.
 */
@UseGuards(JwtAuthGuard)
@Controller('connectors')
export class ConnectorsController {
  @Get()
  list(@Query('type') type?: string) {
    const filter = type && VALID_TYPES.includes(type as ConnectionType) ? (type as ConnectionType) : undefined;
    return listConnectors(filter);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const connector = getConnector(id);
    if (!connector) throw new NotFoundException(`Unknown connector "${id}"`);
    return connector;
  }
}
