import { Module } from '@nestjs/common';
import { EditRequestsService } from './edit-requests.service';
import {
  BookingEditRequestsController,
  EditRequestsController,
} from './edit-requests.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EditRequestsController, BookingEditRequestsController],
  providers: [EditRequestsService],
  exports: [EditRequestsService],
})
export class EditRequestsModule {}
