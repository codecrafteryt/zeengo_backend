import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createAssignmentSchema,
  gpsPingSchema,
  listDriversQuerySchema,
  scheduleQuerySchema,
  updateDriverSchema,
  updateMyScheduleItemSchema,
  updateMyStatusSchema,
} from './drivers.schema';
import type {
  CreateAssignmentDto,
  GpsPingDto,
  ListDriversQuery,
  ScheduleQuery,
  UpdateDriverDto,
  UpdateMyScheduleItemDto,
  UpdateMyStatusDto,
} from './drivers.schema';
import { DriversService } from './drivers.service';

const OPS_ROLES = [StaffRole.admin, StaffRole.ops_manager] as const;
const DRIVER_OPS_ROLES = [...OPS_ROLES, StaffRole.support] as const;

@ApiTags('drivers')
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get('live-positions')
  @Roles(...OPS_ROLES)
  livePositions() {
    return this.driversService.getLivePositions();
  }

  @Get('me')
  @Roles(StaffRole.driver)
  me(@CurrentUser() user: AuthPrincipal) {
    return this.driversService.getMe(user);
  }

  @Get('me/schedule')
  @Roles(StaffRole.driver)
  mySchedule(
    @Query(zodPipe(scheduleQuerySchema)) query: ScheduleQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.driversService.getMySchedule(user, query);
  }

  @Patch('me/schedule/:itemId')
  @Roles(StaffRole.driver)
  updateMyScheduleItem(
    @Param('itemId') itemId: string,
    @Body(zodPipe(updateMyScheduleItemSchema)) body: UpdateMyScheduleItemDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.driversService.updateMyScheduleItem(user, itemId, body);
  }

  @Put('me/status')
  @Roles(StaffRole.driver)
  updateMyStatus(
    @Body(zodPipe(updateMyStatusSchema)) body: UpdateMyStatusDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.driversService.updateMyStatus(user, body);
  }

  @Post('me/gps')
  @Roles(StaffRole.driver)
  recordGps(
    @Body(zodPipe(gpsPingSchema)) body: GpsPingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.driversService.recordGps(user, body);
  }

  @Post('assignments')
  @Roles(...DRIVER_OPS_ROLES)
  createAssignment(
    @Body(zodPipe(createAssignmentSchema)) body: CreateAssignmentDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.driversService.createAssignment(body, user.sub);
  }

  @Delete('assignments/:id')
  @Roles(...DRIVER_OPS_ROLES)
  deleteAssignment(@Param('id') id: string) {
    return this.driversService.deleteAssignment(id);
  }

  @Get('stats')
  @Roles(...DRIVER_OPS_ROLES)
  stats() {
    return this.driversService.getStats();
  }

  @Get('unassigned-bookings')
  @Roles(...DRIVER_OPS_ROLES)
  unassignedBookings() {
    return this.driversService.listUnassignedBookings();
  }

  @Get()
  @Roles(...DRIVER_OPS_ROLES)
  list(@Query(zodPipe(listDriversQuerySchema)) query: ListDriversQuery) {
    return this.driversService.list(query);
  }

  @Get(':id/schedule')
  @Roles(...DRIVER_OPS_ROLES)
  schedule(
    @Param('id') id: string,
    @Query(zodPipe(scheduleQuerySchema)) query: ScheduleQuery,
  ) {
    return this.driversService.getSchedule(id, query);
  }

  @Get(':id/trips')
  @Roles(...DRIVER_OPS_ROLES)
  trips(@Param('id') id: string) {
    return this.driversService.getTrips(id);
  }

  @Get(':id')
  @Roles(...DRIVER_OPS_ROLES)
  getById(@Param('id') id: string) {
    return this.driversService.getById(id);
  }

  @Patch(':id')
  @Roles(...DRIVER_OPS_ROLES)
  update(
    @Param('id') id: string,
    @Body(zodPipe(updateDriverSchema)) body: UpdateDriverDto,
  ) {
    return this.driversService.update(id, body);
  }
}
