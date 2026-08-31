import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { mapMessage } from '../chat/chat.mapper';
import type { TranslationJobData } from './jobs.service';
import { FcmPushService } from '../notifications/fcm-push.service';

@Processor('translation')
export class TranslationProcessor extends WorkerHost {
  private readonly logger = new Logger(TranslationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
  ) {
    super();
  }

  async process(job: Job<TranslationJobData>): Promise<void> {
    const { messageId, body, sourceLang } = job.data;
    this.logger.debug(`Translating message ${messageId} from ${sourceLang}`);

    const bodyTranslated = {
      en: sourceLang === 'en' ? body : `[en] ${body}`,
      ar: sourceLang === 'ar' ? body : `[ar] ${body}`,
      ru: sourceLang === 'ru' ? body : `[ru] ${body}`,
    };

    const row = await this.prisma.message.update({
      where: { id: messageId },
      data: { bodyTranslated },
      include: { senderStaff: true, senderClient: true },
    });

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: row.conversationId },
    });
    const rooms = participants.map((p) =>
      p.participantType === 'staff' ? `user:${p.staffId}` : `client:${p.clientId}`,
    );
    this.realtime.emit('message.translated', mapMessage(row), rooms);
  }
}

export type PushJobData = {
  clientId: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  notificationId?: string;
  tokens: string[];
};

@Processor('push')
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(private readonly fcm: FcmPushService) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<void> {
    const { clientId, title, body, data, notificationId, tokens } = job.data;
    this.logger.debug(`[push] client=${clientId} title="${title}" tokens=${tokens?.length ?? 0}`);
    const result = await this.fcm.sendToTokens({
      clientId,
      title,
      body,
      data,
      notificationId,
      tokens: tokens ?? [],
    });
    this.logger.debug(`[push] done sent=${result.sent} failed=${result.failed}`);
  }
}

@Processor('ai')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`[ai] job ${job.name}`, job.data);
  }
}

@Processor('payments')
export class PaymentsJobProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsJobProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`[payments] job ${job.name}`, job.data);
  }
}

@Processor('digest')
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`[digest] job ${job.name}`, job.data);
  }
}

@Processor('cleanup')
export class CleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`[cleanup] job ${job.name}`, job.data);
  }
}
