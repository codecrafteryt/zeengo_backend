import { Module } from '@nestjs/common';
import { VipController } from './vip.controller';
import { VipService } from './vip.service';
import { EditRequestsModule } from '../edit-requests/edit-requests.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditService } from '../common/audit.service';

@Module({
  imports: [EditRequestsModule, NotificationsModule],
  controllers: [VipController],
  providers: [VipService, AuditService],
})
export class VipModule {}
