import { existsSync, readFileSync } from 'node:fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/unregistered',
]);

const FCM_MULTICAST_LIMIT = 500;

export type ClientPushPayload = {
  clientId: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  notificationId?: string;
  tokens: string[];
};

type FcmTokenEntry = {
  token?: string;
  platform?: string;
  updatedAt?: string;
};

@Injectable()
export class FcmPushService implements OnModuleInit {
  private readonly logger = new Logger(FcmPushService.name);
  private ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    try {
      const credentials = this.loadCredentials();
      if (!credentials) {
        this.logger.warn(
          '[fcm-stub] FCM credentials missing — set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_PATH. Device push stays stubbed until then.',
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

  async sendToTokens(
    payload: ClientPushPayload,
  ): Promise<{ sent: number; failed: number }> {
    const tokens = [...new Set(payload.tokens.map((t) => t.trim()).filter(Boolean))];
    if (tokens.length === 0) {
      this.logger.warn(`No FCM tokens for client ${payload.clientId} — skip push`);
      return { sent: 0, failed: 0 };
    }

    const title = payload.title;
    const body = payload.body || undefined;
    const tag = payload.notificationId || payload.clientId;
    /**
     * Do not send a `data` payload together with `notification`.
     * Android then shows our title AND wakes Flutter's background handler,
     * which posts a second tray item titled "zeengo" / "Zeengo" (app name
     * fallback because `message.notification` is null in that isolate).
     * Deep-link fields remain on GET /notifications and socket `notification.new`.
     */
    if (!this.ready) {
      this.logger.warn(
        `[fcm-stub] NOT sent to device. client=${payload.clientId} title="${payload.title}" tokens=${tokens.length}. Configure FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_PATH.`,
      );
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;
    const dead: string[] = [];

    try {
      for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
        const batch = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
        const response = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          android: {
            priority: 'high',
            collapseKey: tag,
            notification: {
              title,
              body,
              tag,
              sound: 'default',
            },
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: {
              aps: {
                alert: { title, body },
                sound: 'default',
                badge: 1,
              },
            },
          },
        });

        sent += response.successCount;
        failed += response.failureCount;

        response.responses.forEach((res, index) => {
          if (res.success) return;
          const token = batch[index];
          const code = res.error?.code ?? 'unknown';
          this.logger.warn(
            `FCM fail client=${payload.clientId} code=${code} ${res.error?.message ?? ''}`,
          );
          if (token && DEAD_TOKEN_CODES.has(code)) {
            dead.push(token);
          }
        });
      }

      if (dead.length) {
        await this.pruneDeadTokens(payload.clientId, dead);
      } else {
        this.logger.log(
          `FCM sent client=${payload.clientId} title="${payload.title}" success=${sent} failed=${failed}`,
        );
      }

      return { sent, failed };
    } catch (err) {
      this.logger.error(`FCM send failed for client ${payload.clientId}`, err);
      return { sent, failed: failed || tokens.length };
    }
  }

  private async pruneDeadTokens(clientId: string, deadTokens: string[]) {
    const dead = new Set(deadTokens);
    try {
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: { fcmTokens: true },
      });
      if (!client) return;

      const existing = (client.fcmTokens as FcmTokenEntry[] | null) ?? [];
      const kept = existing.filter((entry) => !entry.token || !dead.has(entry.token));
      if (kept.length === existing.length) return;

      await this.prisma.client.update({
        where: { id: clientId },
        data: { fcmTokens: kept },
      });
      this.logger.log(
        `Pruned ${existing.length - kept.length} dead FCM token(s) for client ${clientId}`,
      );
    } catch (err) {
      this.logger.warn(`Failed to prune FCM tokens for client ${clientId}`, err);
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
      return this.normalizeAccount(
        JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>,
      );
    }

    const raw = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON')?.trim() || '';
    if (!raw) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as Record<
        string,
        unknown
      >;
    }
    return this.normalizeAccount(parsed);
  }

  private normalizeAccount(raw: Record<string, unknown>): admin.ServiceAccount {
    const privateKey = String(raw.private_key ?? raw.privateKey ?? '').replace(
      /\\n/g,
      '\n',
    );
    return {
      projectId: String(raw.project_id ?? raw.projectId ?? ''),
      clientEmail: String(raw.client_email ?? raw.clientEmail ?? ''),
      privateKey,
    };
  }
}
