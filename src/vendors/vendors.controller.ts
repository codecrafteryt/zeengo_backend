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
  assignVendorSchema,
  createVendorSchema,
  listVendorsQuerySchema,
  updateVendorBookingSchema,
  updateVendorSchema,
} from './vendors.schema';
import type {
  AssignVendorDto,
  CreateVendorDto,
  ListVendorsQuery,
  UpdateVendorBookingDto,
  UpdateVendorDto,
} from './vendors.schema';
import { VendorsService } from './vendors.service';

const VENDOR_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @Roles(...VENDOR_ROLES)
  list(
    @Query(zodPipe(listVendorsQuerySchema)) query: ListVendorsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.list(query, user);
  }

  @Get('stats')
  @Roles(...VENDOR_ROLES)
  stats(@CurrentUser() user: AuthPrincipal) {
    return this.vendorsService.stats(user);
  }

  @Post()
  @Roles(...VENDOR_ROLES)
  create(
    @Body(zodPipe(createVendorSchema)) body: CreateVendorDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.create(body, user);
  }

  @Get(':id/bookings')
  @Roles(...VENDOR_ROLES)
  bookings(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.vendorsService.listBookings(id, user);
  }

  @Get(':id/finance')
  @Roles(...VENDOR_ROLES)
  finance(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.vendorsService.finance(id, user);
  }

  @Post(':id/assign')
  @Roles(...VENDOR_ROLES)
  assign(
    @Param('id') id: string,
    @Body(zodPipe(assignVendorSchema)) body: AssignVendorDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.assign(id, body, user);
  }

  @Post(':id/bookings/:vendorBookingId/voucher')
  @Roles(...VENDOR_ROLES)
  voucher(
    @Param('id') id: string,
    @Param('vendorBookingId') vendorBookingId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.generateVoucher(id, vendorBookingId, user);
  }

  @Patch(':id/bookings/:vendorBookingId')
  @Roles(...VENDOR_ROLES)
  updateBooking(
    @Param('id') id: string,
    @Param('vendorBookingId') vendorBookingId: string,
    @Body(zodPipe(updateVendorBookingSchema)) body: UpdateVendorBookingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.updateBooking(id, vendorBookingId, body, user);
  }

  @Get(':id')
  @Roles(...VENDOR_ROLES)
  getById(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.vendorsService.getById(id, user);
  }

  @Patch(':id')
  @Roles(...VENDOR_ROLES)
  update(
    @Param('id') id: string,
    @Body(zodPipe(updateVendorSchema)) body: UpdateVendorDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.update(id, body, user);
  }

  @Delete(':id')
  @Roles(...VENDOR_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.vendorsService.remove(id, user);
  }
}
