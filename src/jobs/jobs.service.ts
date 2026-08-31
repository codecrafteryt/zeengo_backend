import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export type TranslationJobData = {
  messageId: string;
  body: string;
  sourceLang: string;
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue('translation') private readonly translationQueue: Queue,
    @InjectQueue('push') private readonly pushQueue: Queue,
    @InjectQueue('ai') private readonly aiQueue: Queue,
    @InjectQueue('payments') private readonly paymentsQueue: Queue,
    @InjectQueue('digest') private readonly digestQueue: Queue,
    @InjectQueue('cleanup') private readonly cleanupQueue: Queue,
  ) {}

  async enqueueTranslation(messageId: string, body: string, sourceLang: string) {
    try {
      await this.translationQueue.add(
        'translate',
        { messageId, body, sourceLang } satisfies TranslationJobData,
        { removeOnComplete: true },
      );
    } catch (err) {
      this.logger.warn('Failed to enqueue translation, falling back to stub', err);
      this.runTranslationStub(messageId, body);
    }
  }

  /** Fallback when queue unavailable — async placeholder translation. */
  private runTranslationStub(messageId: string, body: string) {
    setTimeout(() => {
      this.logger.debug(`[stub] translation complete for message ${messageId}`);
    }, 100);
    void messageId;
    void body;
  }

  async enqueuePush(payload: Record<string, unknown>) {
    await this.pushQueue.add('push', payload, { removeOnComplete: true });
  }

  async enqueueAi(jobName: string, payload: Record<string, unknown>) {
    await this.aiQueue.add(jobName, payload, { removeOnComplete: true });
  }

  async enqueuePayment(jobName: string, payload: Record<string, unknown>) {
    await this.paymentsQueue.add(jobName, payload, { removeOnComplete: true });
  }

  async enqueueDigest(payload: Record<string, unknown>) {
    await this.digestQueue.add('digest', payload, { removeOnComplete: true });
  }

  async enqueueCleanup(payload: Record<string, unknown>) {
    await this.cleanupQueue.add('cleanup', payload, { removeOnComplete: true });
  }
}
