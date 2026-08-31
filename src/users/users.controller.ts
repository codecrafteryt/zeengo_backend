import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { UsersService } from './users.service';
import {
  createStaffUserSchema,
  listUsersQuerySchema,
  resetStaffPasswordSchema,
  updateStaffUserSchema,
} from './users.schema';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';

@ApiTags('users')
@Roles(StaffRole.admin)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: unknown) {
    const input = query as ReturnType<typeof listUsersQuerySchema.parse>;
    return this.usersService.listStaff(input.role);
  }

  @Get('stats')
  stats() {
    return this.usersService.getStats();
  }

  @Post()
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(createStaffUserSchema)) body: unknown,
  ) {
    return this.usersService.createStaff(
      user.sub,
      body as ReturnType<typeof createStaffUserSchema.parse>,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStaffUserSchema)) body: unknown,
  ) {
    return this.usersService.updateStaff(
      user.sub,
      id,
      body as ReturnType<typeof updateStaffUserSchema.parse>,
    );
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetStaffPasswordSchema)) body: unknown,
  ) {
    const input = body as ReturnType<typeof resetStaffPasswordSchema.parse>;
    return this.usersService.resetPassword(user.sub, id, input.password);
  }
}
