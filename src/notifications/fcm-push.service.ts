import { existsSync, readFileSync } from 'node:fs';
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
    try {
      const credentials = this.loadCredentials();
      if (!credentials) {
        this.logger.warn(
          'FCM credentials missing — set FCM_SERVICE_ACCOUNT_JSON (JSON string) or FCM_SERVICE_ACCOUNT_PATH (file). Push will stay stubbed until then.',
        );
        return;
      }

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(credentials),
        });
      }
      this.ready = true;
      this.logger.log(
        `Firebase Admin initialized for FCM (project=${credentials.projectId ?? 'unknown'})`,
      );
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin for FCM', err);
      this.ready = false;
    }
  }

  isReady() {
    return this.ready;
  }

  async sendToTokens(payload: ClientPushPayload): Promise<{ sent: number; failed: number }> {
    const tokens = [...new Set(payload.tokens.filter(Boolean))];
    if (tokens.length === 0) {
      this.logger.warn(`No FCM tokens for client ${payload.clientId} — skip push`);
      return { sent: 0, failed: 0 };
    }

    const data = this.stringifyData({
      ...(payload.data ?? {}),
      notificationId: payload.notificationId,
      clientId: payload.clientId,
    });

    if (!this.ready) {
      this.logger.warn(
        `[fcm-stub] NOT sent to device. client=${payload.clientId} title="${payload.title}" tokens=${tokens.length}. Configure FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_PATH.`,
      );
      return { sent: 0, failed: 0 };
    }

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body || undefined,
        },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'zeengo_default',
            sound: 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true,
            },
          },
        },
      });

      if (response.failureCount > 0) {
        response.responses.forEach((res, index) => {
          if (!res.success) {
            this.logger.warn(
              `FCM fail token[${index}] client=${payload.clientId}: ${res.error?.code ?? 'unknown'} ${res.error?.message ?? ''}`,
            );
          }
        });
      } else {
        this.logger.log(
          `FCM sent client=${payload.clientId} title="${payload.title}" success=${response.successCount}`,
        );
      }

      return { sent: response.successCount, failed: response.failureCount };
    } catch (err) {
      this.logger.error(`FCM send failed for client ${payload.clientId}`, err);
      return { sent: 0, failed: tokens.length };
    }
  }

  private loadCredentials(): admin.ServiceAccount | null {
    const filePath =
      this.config.get<string>('FCM_SERVICE_ACCOUNT_PATH')?.trim() ||
      this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')?.trim() ||
      '';

    if (filePath) {
      if (!existsSync(filePath)) {
        throw new Error(`FCM service account file not found: ${filePath}`);
      }
      return JSON.parse(readFileSync(filePath, 'utf8')) as admin.ServiceAccount;
    }

    const raw = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON')?.trim() || '';
    if (!raw) return null;

    // Support raw JSON, or base64-encoded JSON (common on Railway).
    try {
      return JSON.parse(raw) as admin.ServiceAccount;
    } catch {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded) as admin.ServiceAccount;
    }
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
