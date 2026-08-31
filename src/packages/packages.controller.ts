import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createPackageSchema,
  updatePackageSchema,
} from './packages.schema';
import type { CreatePackageDto, UpdatePackageDto } from './packages.schema';
import { PackagesService } from './packages.service';

@ApiTags('packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  @Roles(
    'client',
    StaffRole.admin,
    StaffRole.ops_manager,
    StaffRole.support,
  )
  list(@CurrentUser() user: AuthPrincipal) {
    return this.packagesService.list(user);
  }

  @Post()
  @Roles(StaffRole.admin)
  create(@Body(zodPipe(createPackageSchema)) body: CreatePackageDto) {
    return this.packagesService.create(body);
  }

  @Patch(':id')
  @Roles(StaffRole.admin)
  update(
    @Param('id') id: string,
    @Body(zodPipe(updatePackageSchema)) body: UpdatePackageDto,
  ) {
    return this.packagesService.update(id, body);
  }

  @Delete(':id')
  @Roles(StaffRole.admin)
  remove(@Param('id') id: string) {
    return this.packagesService.softDelete(id);
  }
}
