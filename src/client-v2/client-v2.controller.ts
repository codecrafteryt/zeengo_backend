import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/roles.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  destinationsQuerySchema,
  nearbyPlacesQuerySchema,
} from './client-v2.schema';
import type { DestinationsQuery, NearbyPlacesQuery } from './client-v2.schema';
import { ClientV2Service } from './client-v2.service';

/**
 * Guest discovery APIs for the new aLo client app.
 * Paths under /api/v1/client/v2/* — does not modify /client (v1) portal.
 */
@ApiTags('client-v2')
@Public()
@Controller('client/v2')
export class ClientV2Controller {
  constructor(private readonly clientV2Service: ClientV2Service) {}

  @Get('home')
  home() {
    return this.clientV2Service.homeFeed();
  }

  @Get('places')
  places(@Query(zodPipe(nearbyPlacesQuerySchema)) query: NearbyPlacesQuery) {
    return this.clientV2Service.listPlaces(query);
  }

  @Get('places/:slugOrId')
  place(@Param('slugOrId') slugOrId: string) {
    return this.clientV2Service.getPlace(slugOrId);
  }

  @Get('destinations')
  destinations(
    @Query(zodPipe(destinationsQuerySchema)) query: DestinationsQuery,
  ) {
    return this.clientV2Service.listDestinations(query);
  }

  @Get('trip')
  trip() {
    return this.clientV2Service.trip();
  }
}
