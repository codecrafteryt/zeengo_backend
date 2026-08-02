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
  createBookingSchema,
  createBookingNoteSchema,
  createChecklistItemSchema,
  listBookingsQuerySchema,
  updateBookingSchema,
  updateChecklistItemSchema,
} from './bookings.schema';
import type {
  CreateBookingDto,
  CreateBookingNoteDto,
  CreateChecklistItemDto,
  ListBookingsQuery,
  UpdateBookingDto,
  UpdateChecklistItemDto,
} from './bookings.schema';
import { BookingsService } from './bookings.service';

const BOOKING_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  'client',
] as const;

const BOOKING_WRITE_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(...BOOKING_WRITE_ROLES)
  create(
    @Body(zodPipe(createBookingSchema)) body: CreateBookingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.bookingsService.create(body, user.sub);
  }

  @Get()
  @Roles(...BOOKING_READ_ROLES)
  list(
    @Query(zodPipe(listBookingsQuerySchema)) query: ListBookingsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.bookingsService.list(query, user);
  }

  @Get('stats')
  @Roles(...BOOKING_WRITE_ROLES, StaffRole.splizer)
  stats(@CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.stats(user);
  }

  @Get(':id')
  @Roles(...BOOKING_READ_ROLES)
  getById(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.getById(id, user);
  }

  @Patch(':id')
  @Roles(...BOOKING_WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body(zodPipe(updateBookingSchema)) body: UpdateBookingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.bookingsService.update(id, body, user);
  }

  @Get(':id/checklist')
  @Roles(...BOOKING_READ_ROLES)
  listChecklist(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.listChecklist(id, user);
  }

  @Post(':id/checklist')
  @Roles(...BOOKING_WRITE_ROLES)
  createChecklistItem(
    @Param('id') id: string,
    @Body(zodPipe(createChecklistItemSchema)) body: CreateChecklistItemDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.bookingsService.createChecklistItem(id, body, user);
  }

  @Patch(':id/checklist/:itemId')
  @Roles(...BOOKING_WRITE_ROLES)
  updateChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(zodPipe(updateChecklistItemSchema)) body: UpdateChecklistItemDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.bookingsService.updateChecklistItem(id, itemId, body, user);
  }

  @Delete(':id/checklist/:itemId')
  @Roles(...BOOKING_WRITE_ROLES)
  deleteChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.bookingsService.deleteChecklistItem(id, itemId, user);
  }

  @Get(':id/notes')
  @Roles(...BOOKING_WRITE_ROLES)
  listNotes(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.listNotes(id, user);
  }

  @Post(':id/notes')
  @Roles(...BOOKING_WRITE_ROLES)
  createNote(
    @Param('id') id: string,
    @Body(zodPipe(createBookingNoteSchema)) body: CreateBookingNoteDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.bookingsService.createNote(id, body, user);
  }

  @Get(':id/payments')
  @Roles(...BOOKING_READ_ROLES)
  listPayments(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.listPayments(id, user);
  }
}
