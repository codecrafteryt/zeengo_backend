import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SeedDemoService } from './seed-demo.service';

@Module({
  controllers: [SystemController],
  providers: [SeedDemoService],
})
export class SystemModule {}