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
import {
  createEditRequestSchema,
  listEditRequestsQuerySchema,
  reviewEditRequestSchema,
} from './edit-requests.schema';
import type {
  CreateEditRequestDto,
  ListEditRequestsQuery,
  ReviewEditRequestDto,
} from './edit-requests.schema';
import { EditRequestsService } from './edit-requests.service';

const STAFF_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
] as const;

const REVIEW_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('edit-requests')
@Controller('edit-requests')
export class EditRequestsController {
  constructor(private readonly editRequestsService: EditRequestsService) {}

  @Get()
  @Roles(...STAFF_READ_ROLES)
  list(
    @Query(zodPipe(listEditRequestsQuerySchema)) query: ListEditRequestsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.editRequestsService.list(query, user);
  }

  @Post()
  @Roles('client')
  create(
    @Body(zodPipe(createEditRequestSchema)) body: CreateEditRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.editRequestsService.create(body, user);
  }

  @Get(':id')
  @Roles(...STAFF_READ_ROLES, 'client')
  getById(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.editRequestsService.getById(id, user);
  }

  @Post(':id/approve')
  @Roles(...REVIEW_ROLES)
  approve(
    @Param('id') id: string,
    @Body(zodPipe(reviewEditRequestSchema)) body: ReviewEditRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.editRequestsService.approve(id, body, user);
  }

  @Post(':id/reject')
  @Roles(...REVIEW_ROLES)
  reject(
    @Param('id') id: string,
    @Body(zodPipe(reviewEditRequestSchema)) body: ReviewEditRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.editRequestsService.reject(id, body, user);
  }
}

@ApiTags('edit-requests')
@Controller('bookings/:bookingId/edit-requests')
export class BookingEditRequestsController {
  constructor(private readonly editRequestsService: EditRequestsService) {}

  @Get()
  @Roles(...STAFF_READ_ROLES, 'client')
  listByBooking(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.editRequestsService.listByBooking(bookingId, user);
  }
}
