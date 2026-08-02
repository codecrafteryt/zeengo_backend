import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { SettingsService } from './settings.service';
import { updateSettingSchema } from './settings.schema';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';

@ApiTags('settings')
@Roles(StaffRole.admin)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  listAll() {
    return this.settingsService.listAll();
  }

  @Get(':key')
  getByKey(@Param('key') key: string) {
    return this.settingsService.getByKey(key);
  }

  @Put(':key')
  upsert(
    @CurrentUser() user: AuthPrincipal,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateSettingSchema)) body: unknown,
  ) {
    const input = body as ReturnType<typeof updateSettingSchema.parse>;
    return this.settingsService.upsert(user.sub, key, input.value);
  }
}
