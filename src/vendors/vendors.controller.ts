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
  updateVendorSchema,
} from './vendors.schema';
import type {
  AssignVendorDto,
  CreateVendorDto,
  ListVendorsQuery,
  UpdateVendorDto,
} from './vendors.schema';
import { VendorsService } from './vendors.service';

const VENDOR_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

const VENDOR_WRITE_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
] as const;

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @Roles(...VENDOR_READ_ROLES)
  list(
    @Query(zodPipe(listVendorsQuerySchema)) query: ListVendorsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.list(query, user);
  }

  @Post()
  @Roles(...VENDOR_WRITE_ROLES)
  create(
    @Body(zodPipe(createVendorSchema)) body: CreateVendorDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.create(body, user);
  }

  @Patch(':id')
  @Roles(...VENDOR_WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body(zodPipe(updateVendorSchema)) body: UpdateVendorDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.update(id, body, user);
  }

  @Delete(':id')
  @Roles(...VENDOR_WRITE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.vendorsService.remove(id, user);
  }

  @Post(':id/assign')
  @Roles(...VENDOR_WRITE_ROLES)
  assign(
    @Param('id') id: string,
    @Body(zodPipe(assignVendorSchema)) body: AssignVendorDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.vendorsService.assign(id, body, user);
  }

  @Get(':id/finance')
  @Roles(...VENDOR_READ_ROLES)
  finance(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.vendorsService.finance(id, user);
  }
}
