import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { createSosSchema, listSosQuerySchema } from './sos.schema';
import type { CreateSosDto, ListSosQuery } from './sos.schema';
import { SosService } from './sos.service';

const SOS_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  StaffRole.driver,
] as const;

const SOS_RESOLVE_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('sos')
@Controller('sos')
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @Post()
  @Roles('client')
  create(
    @Body(zodPipe(createSosSchema)) body: CreateSosDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.sosService.create(body, user);
  }

  @Get()
  @Roles(...SOS_READ_ROLES)
  list(
    @Query(zodPipe(listSosQuerySchema)) query: ListSosQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.sosService.list(query, user);
  }

  @Get(':id')
  @Roles(...SOS_READ_ROLES, 'client')
  getById(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.sosService.getById(id, user);
  }

  @Post(':id/resolve')
  @Roles(...SOS_RESOLVE_ROLES)
  resolve(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.sosService.resolve(id, user);
  }
}
