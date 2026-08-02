import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JobsService } from './jobs.service';
import {
  AiProcessor,
  CleanupProcessor,
  DigestProcessor,
  PaymentsJobProcessor,
  PushProcessor,
  TranslationProcessor,
} from './jobs.processors';

const QUEUE_NAMES = ['translation', 'push', 'ai', 'payments', 'digest', 'cleanup'] as const;

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
        },
      }),
    }),
    BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name }))),
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
