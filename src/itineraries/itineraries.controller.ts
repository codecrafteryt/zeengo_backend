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
  createItineraryItemSchema,
  dailyOperationsQuerySchema,
  dailyOperationsWeekQuerySchema,
  importItinerarySchema,
  updateItineraryItemSchema,
} from './itineraries.schema';
import type {
  CreateItineraryItemDto,
  DailyOperationsQuery,
  DailyOperationsWeekQuery,
  ImportItineraryDto,
  UpdateItineraryItemDto,
} from './itineraries.schema';
import { ItinerariesService } from './itineraries.service';

const ITINERARY_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  StaffRole.driver,
  'client',
] as const;

const ITINERARY_WRITE_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('itineraries')
@Controller()
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Get('bookings/:id/itinerary')
  @Roles(...ITINERARY_READ_ROLES)
  getByBooking(
    @Param('id') bookingId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.itinerariesService.getByBookingId(bookingId, user);
  }

  @Post('bookings/:id/itinerary/items')
  @Roles(...ITINERARY_WRITE_ROLES)
  createItem(
    @Param('id') bookingId: string,
    @Body(zodPipe(createItineraryItemSchema)) body: CreateItineraryItemDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.itinerariesService.createItem(bookingId, body, user);
  }

  @Post('bookings/:id/itinerary/import')
  @Roles(...ITINERARY_WRITE_ROLES)
  importItinerary(
    @Param('id') bookingId: string,
    @Body(zodPipe(importItinerarySchema)) body: ImportItineraryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.itinerariesService.importItinerary(bookingId, body, user);
  }

  @Patch('itinerary/items/:itemId')
  @Roles(...ITINERARY_WRITE_ROLES)
  updateItem(
    @Param('itemId') itemId: string,
    @Body(zodPipe(updateItineraryItemSchema)) body: UpdateItineraryItemDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.itinerariesService.updateItem(itemId, body, user);
  }

  @Delete('itinerary/items/:itemId')
  @Roles(...ITINERARY_WRITE_ROLES)
  deleteItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.itinerariesService.deleteItem(itemId, user);
  }

  @Get('daily-operations')
  @Roles(
    StaffRole.admin,
    StaffRole.ops_manager,
    StaffRole.support,
    StaffRole.driver,
  )
  dailyOperations(
    @Query(zodPipe(dailyOperationsQuerySchema)) query: DailyOperationsQuery,
  ) {
    return this.itinerariesService.dailyOperations(query);
  }

  @Get('daily-operations/week')
  @Roles(
    StaffRole.admin,
    StaffRole.ops_manager,
    StaffRole.support,
    StaffRole.driver,
  )
  dailyOperationsWeek(
    @Query(zodPipe(dailyOperationsWeekQuerySchema)) query: DailyOperationsWeekQuery,
  ) {
    return this.itinerariesService.dailyOperationsWeek(query);
  }
}
