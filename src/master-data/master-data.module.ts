import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataImportService } from './master-data-import.service';

@Module({
  controllers: [MasterDataController],
  providers: [MasterDataImportService],
  exports: [MasterDataImportService],
})
export class MasterDataModule {}
