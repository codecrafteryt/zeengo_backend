import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditService } from '../common/audit.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SosController],
  providers: [SosService, AuditService],
})
export class SosModule {}
