import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  listClientsQuerySchema,
  updateClientSchema,
} from './clients.schema';
import type { ListClientsQuery, UpdateClientDto } from './clients.schema';
import { ClientsService } from './clients.service';

const STAFF_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  StaffRole.driver,
] as const;

@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  list(@Query(zodPipe(listClientsQuerySchema)) query: ListClientsQuery) {
    return this.clientsService.list(query);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  getById(@Param('id') id: string) {
    return this.clientsService.getById(id);
  }

  @Patch(':id')
  @Roles(StaffRole.admin, StaffRole.ops_manager, StaffRole.support)
  update(
    @Param('id') id: string,
    @Body(zodPipe(updateClientSchema)) body: UpdateClientDto,
  ) {
    return this.clientsService.update(id, body);
  }
}
