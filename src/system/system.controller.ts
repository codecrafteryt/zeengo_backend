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
  @Get('health')
  async health() {
    const checks: Record<string, { status: string; detail?: string }> = {
      api: { status: 'operational' },
      postgres: { status: 'unknown' },
      redis: { status: 'unknown' },
      stripe: {
        status: this.config.get('STRIPE_SECRET_KEY') ? 'configured' : 'missing_key',
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
    } catch (e) {
      checks.postgres = {
        status: 'down',
        detail: e instanceof Error ? e.message : 'error',
      };
    }

    try {
      const pong = await this.redis.raw.ping();
      checks.redis = { status: pong === 'PONG' ? 'operational' : 'down' };
    } catch (e) {
      checks.redis = {
        status: 'down',
        detail: e instanceof Error ? e.message : 'error',
      };
    }

    const healthy =
      checks.postgres.status === 'operational' &&
      checks.redis.status === 'operational';

    return {
      status: healthy ? 'ok' : 'degraded',
      checks,
      websocket: 'see /ws namespace',
    };
  }

  /**
   * Temporary: seed demo staff + packages via the running API (private DB).
   * Requires body.token. Forces demo password 1234567 so staff login works.
   * Remove after production bootstrap.
   */
  @Public()
  @Post('seed-demo')
  async seedDemoEndpoint(@Body() body: { token?: string }) {
    const expected =
      this.config.get<string>('SEED_BOOTSTRAP_TOKEN')?.trim() ||
      BOOTSTRAP_SEED_TOKEN;
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
