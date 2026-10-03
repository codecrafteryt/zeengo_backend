import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BookingsModule } from '../bookings/bookings.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { PaymentsController } from './payments.controller';
import { SplizerController } from './splizer.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CommonModule, BookingsModule, DashboardModule],
  controllers: [PaymentsController, SplizerController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
