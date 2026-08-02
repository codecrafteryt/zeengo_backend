import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import { Public } from '../common/decorators/roles.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
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
}
