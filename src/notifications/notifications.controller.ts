import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { listNotificationsQuerySchema } from './notifications.schema';
import type { ListNotificationsQuery } from './notifications.schema';
import { NotificationsService } from './notifications.service';

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
  unreadCount(@CurrentUser() user: AuthPrincipal) {
    return this.notificationsService.unreadCount(user);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthPrincipal) {
    return this.notificationsService.markAllRead(user);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.notificationsService.markRead(id, user);
  }
}
