import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import { Public } from '../common/decorators/roles.decorator';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../common/errors/app-error';
import { DEMO_STAFF_PASSWORD } from '../auth/ensure-demo-staff';
import { SeedDemoService } from './seed-demo.service';

/** One-shot public bootstrap token — remove this endpoint after prod seed. */
const BOOTSTRAP_SEED_TOKEN = 'zeengo-bootstrap-9f3k2m7xq-20260924';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly seedDemo: SeedDemoService,
  ) {}

  @Public()
  @Get('health/live')
  live() {
    return { status: 'live' };
  }

  @Public()
  @Get('health/ready')
  async ready() {
    const checks = await this.dependencyChecks();
    const ready =
      checks.postgres.status === 'operational' &&
      checks.redis.status === 'operational' &&
      checks.schema.status === 'operational';
    if (!ready) {
      throw AppError.serviceUnavailable(
        checks.schema.status === 'incomplete' ? 'SCHEMA_DRIFT' : 'NOT_READY',
        'API is not ready',
        { checks },
      );
    }
    return { status: 'ready', checks };
  }

  @Public()
  @Get('health')
  async health() {
    const checks = await this.dependencyChecks();
    const healthy =
      checks.postgres.status === 'operational' &&
      checks.redis.status === 'operational';

    return {
      status: healthy ? 'ok' : 'degraded',
      checks,
      websocket: 'see /ws namespace',
    };
  }

  private async dependencyChecks() {
    const stripeKey = (this.config.get<string>('STRIPE_SECRET_KEY') || '').trim();
    const checks: Record<string, { status: string }> = {
      api: { status: 'operational' },
      postgres: { status: 'unknown' },
      redis: { status: 'unknown' },
      schema: { status: 'unknown' },
      storage: {
        status: (this.config.get<string>('STORAGE_PROVIDER') || 'local') === 's3'
          ? this.config.get('STORAGE_BUCKET')
            ? 'configured'
            : 'missing_key'
          : 'local',
      },
      stripe: {
        status:
          stripeKey && stripeKey.startsWith('sk_') && !stripeKey.includes('replace')
            ? 'configured'
            : 'missing_key',
      },
      claude: {
        status: this.config.get('ANTHROPIC_API_KEY') ? 'configured' : 'missing_key',
      },
      fcm: {
        status:
          this.config.get('FCM_SERVICE_ACCOUNT_JSON') ||
          this.config.get('FCM_SERVICE_ACCOUNT_PATH') ||
          this.config.get('GOOGLE_APPLICATION_CREDENTIALS')
            ? 'configured'
            : 'missing_key',
      },
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: 'operational' };
    } catch {
      checks.postgres = { status: 'down' };
    }

    try {
      const pong = await this.redis.raw.ping();
      checks.redis = { status: pong === 'PONG' ? 'operational' : 'down' };
    } catch {
      checks.redis = { status: 'down' };
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'bookings'
          AND column_name = 'children_count'
      `;
      checks.schema = {
        status: rows.length > 0 ? 'operational' : 'incomplete',
      };
    } catch {
      checks.schema = { status: 'incomplete' };
    }

    return checks;
  }

  /**
   * Temporary: seed demo staff + packages via the running API (private DB).
   * Requires body.token. Forces demo password 1234567 so staff login works.
   * Remove after production bootstrap.
   */
  @Public()
  @Post('seed-demo')
  async seedDemoEndpoint(@Body() body: { token?: string }) {
    const configured = this.config.get<string>('SEED_BOOTSTRAP_TOKEN')?.trim();
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production' && !configured) {
      throw AppError.forbidden('Demo seed is disabled in production');
    }
    const expected = configured || BOOTSTRAP_SEED_TOKEN;
    if (!body?.token || body.token !== expected) {
      throw AppError.unauthorized('Invalid bootstrap token');
    }

    // Force known demo password regardless of Railway SEED_* overrides
    const result = await this.seedDemo.runCoreSeed({ forceDemoPassword: true });

    return {
      ok: true,
      staffEmails: result.staffEmails,
      packageSlugs: result.packageSlugs,
      loginHint: {
        email: 'admin@zeengo.com',
        password: DEMO_STAFF_PASSWORD,
      },
    };
  }
}
