import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  activateVipSchema,
  escalateVipSchema,
  vipRequestSchema,
} from './vip.schema';
import type {
  ActivateVipDto,
  EscalateVipDto,
  VipRequestDto,
} from './vip.schema';
import { VipService } from './vip.service';

const VIP_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
] as const;

const VIP_WRITE_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('vip')
@Controller('vip')
export class VipController {
  constructor(private readonly vipService: VipService) {}

  @Get('overview')
  @Roles(...VIP_READ_ROLES)
  overview(@CurrentUser() user: AuthPrincipal) {
    return this.vipService.overview(user);
  }

  @Get('candidates')
  @Roles(...VIP_READ_ROLES)
  candidates(@CurrentUser() user: AuthPrincipal) {
    return this.vipService.listCandidates(user);
  }

  @Get('clients')
  @Roles(...VIP_READ_ROLES)
  listClients(@CurrentUser() user: AuthPrincipal) {
    return this.vipService.listVipClients(user);
  }

  @Get('clients/:bookingId')
  @Roles(...VIP_READ_ROLES)
  getClientFile(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vipService.getClientFile(bookingId, user);
  }

  @Get('requests')
  @Roles(...VIP_READ_ROLES)
  listRequests(@CurrentUser() user: AuthPrincipal) {
    return this.vipService.listPendingRequests(user);
  }

  @Post('activate')
  @Roles(...VIP_WRITE_ROLES)
  activate(
    @Body(zodPipe(activateVipSchema)) body: ActivateVipDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vipService.activate(body, user);
  }

  @Post('clients/:bookingId/escalate')
  @Roles(...VIP_WRITE_ROLES)
  escalate(
    @Param('bookingId') bookingId: string,
    @Body(zodPipe(escalateVipSchema)) body: EscalateVipDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vipService.escalate(bookingId, body, user);
  }

  @Post('request')
  @Roles('client')
  request(
    @Body(zodPipe(vipRequestSchema)) body: VipRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vipService.requestUpgrade(body, user);
  }
}
