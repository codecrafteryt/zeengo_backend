import { Module } from '@nestjs/common';
import { ClientV2Controller } from './client-v2.controller';
import { ClientV2Service } from './client-v2.service';
import { PublicCatalogService } from './public-catalog.service';

@Module({
  controllers: [ClientV2Controller],
  providers: [ClientV2Service, PublicCatalogService],
  exports: [PublicCatalogService],
})
export class ClientV2Module {}
