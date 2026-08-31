import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { listNotificationsQuerySchema } from './notifications.schema';
import type { ListNotificationsQuery } from './notifications.schema';
import { NotificationsService } from './notifications.service';

const STAFF_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  StaffRole.driver,
] as const;

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Query(zodPipe(listNotificationsQuerySchema)) query: ListNotificationsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.notificationsService.list(query, user);
  }

  @Get('unread-count')
  @Roles(...STAFF_ROLES)
  unreadCount(@CurrentUser() user: AuthPrincipal) {
    return this.notificationsService.unreadCount(user);
  }

  @Post('read-all')
  @Roles(...STAFF_ROLES)
  markAllRead(@CurrentUser() user: AuthPrincipal) {
    return this.notificationsService.markAllRead(user);
  }

  @Post(':id/read')
  @Roles(...STAFF_ROLES)
  markRead(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.notificationsService.markRead(id, user);
  }
}
