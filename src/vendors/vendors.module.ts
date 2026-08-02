import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { AuditService } from '../common/audit.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, AuditService],
  exports: [VendorsService],
})
export class VendorsModule {}
