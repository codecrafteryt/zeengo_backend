import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

function resolveCorsOrigins(): boolean | string[] {
  const raw =
    process.env.APP_WEB_ORIGIN ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,http://127.0.0.1:5173';

  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Develop freely if unset/wildcard
  if (list.length === 0 || list.includes('*')) {
    return true;
  }

  // Always allow both localhost and 127.0.0.1 Vite origins in development
  const origins = new Set(list);
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:4173');
    origins.add('http://127.0.0.1:4173');
  }

  return [...origins];
}

async function bootstrap() {
  // eslint-disable-next-line no-console
  console.log('boot: starting nest');
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zeengo API')
    .setDescription('Zeengo ops dashboard + client app backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Zeengo API listening on http://0.0.0.0:${port}/api/v1`);
  // eslint-disable-next-line no-console
  console.log(`OpenAPI docs at http://0.0.0.0:${port}/api/docs`);
}
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('boot failed', err);
  process.exit(1);
});
