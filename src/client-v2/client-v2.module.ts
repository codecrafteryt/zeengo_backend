import { Module } from '@nestjs/common';
import { ClientV2Controller } from './client-v2.controller';
import { ClientV2Service } from './client-v2.service';

@Module({
  controllers: [ClientV2Controller],
  providers: [ClientV2Service],
})
export class ClientV2Module {}
