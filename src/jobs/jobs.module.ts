import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JobsService } from './jobs.service';
import { redisConnection } from '../redis/redis.module';
import {
  AiProcessor,
  CleanupProcessor,
  DigestProcessor,
  PaymentsJobProcessor,
  PushProcessor,
  TranslationProcessor,
} from './jobs.processors';
import { NotificationsModule } from '../notifications/notifications.module';

const QUEUE_NAMES = ['translation', 'push', 'ai', 'payments', 'digest', 'cleanup'] as const;

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name }))),
    forwardRef(() => NotificationsModule),
  ],
  providers: [
    JobsService,
    TranslationProcessor,
    PushProcessor,
    AiProcessor,
    PaymentsJobProcessor,
    DigestProcessor,
    CleanupProcessor,
  ],
  exports: [JobsService, BullModule],
})
export class JobsModule {}
