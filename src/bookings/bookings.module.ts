import { Module } from '@nestjs/common';
import { BookingsController, ClientBookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController, ClientBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
