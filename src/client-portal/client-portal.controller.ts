import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { ClientPortalService } from './client-portal.service';

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

  @Get('activities/:id')
  activity(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.clientPortalService.activity(user, id);
  }
}
