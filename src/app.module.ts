import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { SystemModule } from './system/system.module';
import { PackagesModule } from './packages/packages.module';
import { ClientsModule } from './clients/clients.module';
import { BookingsModule } from './bookings/bookings.module';
import { ItinerariesModule } from './itineraries/itineraries.module';
import { PaymentsModule } from './payments/payments.module';
import { FinanceModule } from './finance/finance.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RealtimeModule } from './realtime/realtime.module';
import { DriversModule } from './drivers/drivers.module';
import { ReviewsModule } from './reviews/reviews.module';
import { TasksModule } from './tasks/tasks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EditRequestsModule } from './edit-requests/edit-requests.module';
import { VipModule } from './vip/vip.module';
import { SosModule } from './sos/sos.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { VendorsModule } from './vendors/vendors.module';
import { EmailsModule } from './emails/emails.module';
import { AiModule } from './ai/ai.module';
import { JobsModule } from './jobs/jobs.module';
import { OperationsModule } from './operations/operations.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    CommonModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    JobsModule,
    ChatModule,
    RealtimeModule,
    SystemModule,
    PackagesModule,
    ClientsModule,
    BookingsModule,
    ItinerariesModule,
    PaymentsModule,
    FinanceModule,
    WebhooksModule,
    DriversModule,
    ReviewsModule,
    TasksModule,
    DashboardModule,
    NotificationsModule,
    EditRequestsModule,
    VipModule,
    SosModule,
    VendorsModule,
    OperationsModule,
    ClientPortalModule,
    EmailsModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
