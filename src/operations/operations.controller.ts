import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createStaffLinkSchema,
  listOperationsQuerySchema,
  updateOpsItemSchema,
  upsertDayPlanSchema,
} from './operations.schema';
import type {
  CreateStaffLinkDto,
  ListOperationsQuery,
  UpdateOpsItemDto,
  UpsertDayPlanDto,
} from './operations.schema';
import { OperationsService } from './operations.service';

const OPS_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('operations')
@Roles(...OPS_ROLES)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('clients')
  listClients(
    @Query(zodPipe(listOperationsQuerySchema)) query: ListOperationsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.operationsService.listClients(query, user);
  }

  @Get('urgent')
  urgent(@CurrentUser() user: AuthPrincipal) {
    return this.operationsService.urgentTasks(user);
  }

  @Get('bookings/:id')
  getBooking(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.operationsService.getBooking(id, user);
  }

  @Post('bookings/:id/day-plan')
  upsertDayPlan(
    @Param('id') id: string,
    @Body(zodPipe(upsertDayPlanSchema)) body: UpsertDayPlanDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.operationsService.upsertDayPlan(id, body, user);
  }

  @Post('bookings/:id/staff')
  addStaff(
    @Param('id') id: string,
    @Body(zodPipe(createStaffLinkSchema)) body: CreateStaffLinkDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.operationsService.addStaffLink(id, body, user);
  }

  @Delete('staff-links/:linkId')
  removeStaff(@Param('linkId') linkId: string, @CurrentUser() user: AuthPrincipal) {
    return this.operationsService.removeStaffLink(linkId, user);
  }

  @Patch('items/:itemId')
  updateItem(
    @Param('itemId') itemId: string,
    @Body(zodPipe(updateOpsItemSchema)) body: UpdateOpsItemDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.operationsService.updateItem(itemId, body, user);
  }
}
