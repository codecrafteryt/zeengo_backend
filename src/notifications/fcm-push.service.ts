import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export type ClientPushPayload = {
  clientId: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  notificationId?: string;
  tokens: string[];
};

@Injectable()
export class FcmPushService implements OnModuleInit {
  private readonly logger = new Logger(FcmPushService.name);
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON')?.trim();
    if (!raw) {
      this.logger.warn(
        'FCM_SERVICE_ACCOUNT_JSON not set — client push notifications will be logged only',
      );
      return;
    }

    try {
      const credentials = JSON.parse(raw) as admin.ServiceAccount;
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(credentials),
        });
      }
      this.ready = true;
      this.logger.log('Firebase Admin initialized for FCM');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin from FCM_SERVICE_ACCOUNT_JSON', err);
    }
  }

  async sendToTokens(payload: ClientPushPayload): Promise<{ sent: number; failed: number }> {
    const tokens = [...new Set(payload.tokens.filter(Boolean))];
    if (tokens.length === 0) {
      this.logger.debug(`No FCM tokens for client ${payload.clientId}`);
      return { sent: 0, failed: 0 };
    }

    const data = this.stringifyData({
      ...(payload.data ?? {}),
      notificationId: payload.notificationId,
      clientId: payload.clientId,
    });

    if (!this.ready) {
      this.logger.log(
        `[fcm-stub] client=${payload.clientId} title="${payload.title}" tokens=${tokens.length}`,
      );
      return { sent: 0, failed: 0 };
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body ?? undefined,
      },
      data,
      android: {
        priority: 'high',
        notification: { channelId: 'zeengo_default' },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
    });

    if (response.failureCount > 0) {
      response.responses.forEach((res, index) => {
        if (!res.success) {
          this.logger.warn(
            `FCM fail token[${index}] client=${payload.clientId}: ${res.error?.code ?? 'unknown'}`,
          );
        }
      });
    }

    return { sent: response.successCount, failed: response.failureCount };
  }

  private stringifyData(data: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      out[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return out;
  }
}
