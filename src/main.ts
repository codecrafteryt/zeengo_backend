import { writeSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { resolveCorsOrigins } from './config/cors.policy';

async function bootstrap() {
  writeSync(1, 'boot: starting nest\n');
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(
    helmet({
      // Allow browser SPA on another origin (Vite :5173/:5174) to read API responses
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.enableCors({
    origin: resolveCorsOrigins(
      process.env.APP_WEB_ORIGIN || process.env.CORS_ORIGIN,
      process.env.NODE_ENV || 'development',
    ),
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
  writeSync(1, `Zeengo API listening on http://0.0.0.0:${port}/api/v1\n`);
  writeSync(1, `OpenAPI docs at http://0.0.0.0:${port}/api/docs\n`);
}
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('boot failed', err);
  process.exit(1);
});
