import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService, REDIS_CLIENT } from '../src/redis/redis.module';
import { JobsService } from '../src/jobs/jobs.service';

describe('Zeengo API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        $queryRaw: async () => [{ '?column?': 1 }],
        staffUser: {
          upsert: async (args: { where: { email: string } }) => ({
            id: '00000000-0000-0000-0000-000000000001',
            email: args.where.email,
            role: 'admin',
          }),
        },
        driverProfile: {
          upsert: async () => ({ id: '00000000-0000-0000-0000-000000000002' }),
        },
      })
      .overrideProvider(REDIS_CLIENT)
      .useValue({
        ping: async () => 'PONG',
        disconnect: () => undefined,
      })
      .overrideProvider(RedisService)
      .useValue({
        raw: { ping: async () => 'PONG' },
        onModuleDestroy: () => undefined,
      })
      .overrideProvider(JobsService)
      .useValue({
        onModuleInit: () => undefined,
        onModuleDestroy: () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/system/health/live returns 200', () => {
    return request(app.getHttpServer())
      .get('/api/v1/system/health/live')
      .expect(200)
      .expect((res) => {
        expect(res.body.data?.status || res.body.status).toBe('live');
      });
  });

  it('GET /api/v1/system/health returns 200', () => {
    return request(app.getHttpServer())
      .get('/api/v1/system/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body.data).toHaveProperty('status');
        expect(['ok', 'degraded']).toContain(res.body.data.status);
      });
  });

  it('POST /api/v1/auth/staff/login with empty body returns validation error', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({})
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });
  });
});
