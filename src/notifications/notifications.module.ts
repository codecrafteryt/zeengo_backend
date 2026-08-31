import { Module, forwardRef } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmPushService } from './fcm-push.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [forwardRef(() => JobsModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService, FcmPushService],
  exports: [NotificationsService, FcmPushService],
})
export class NotificationsModule {}
