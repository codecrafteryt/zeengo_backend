import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { ClientPortalService } from './client-portal.service';
import { listClientTasksQuerySchema } from './client-portal.schema';
import type { ListClientTasksQuery } from './client-portal.schema';

@ApiTags('client-portal')
@Roles('client')
@Controller('client')
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Get('home')
  home(@CurrentUser() user: AuthPrincipal) {
    return this.clientPortalService.home(user);
  }

  @Get('itinerary')
  itinerary(@CurrentUser() user: AuthPrincipal) {
    return this.clientPortalService.itinerary(user);
  }

  @Get('tasks')
  tasks(
    @Query(zodPipe(listClientTasksQuerySchema)) query: ListClientTasksQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.clientPortalService.listTasks(user, query);
  }

  @Get('tasks/:id')
  task(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.clientPortalService.getTask(user, id);
  }

  @Get('activities/:id')
  activity(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.clientPortalService.activity(user, id);
  }
}
