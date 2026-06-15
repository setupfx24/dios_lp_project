import 'reflect-metadata';

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { AppConfigService } from './config/config.module.js';

// Serialize bigint columns (e.g. trades.id) as strings so JSON responses
// don't throw "Do not know how to serialize a BigInt".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    logger: false, // we use nestjs-pino
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576, // 1 MB
  });

  // `rawBody: true` makes Nest keep the raw request buffer on `req.rawBody`
  // (used for HMAC signature verification) while still parsing JSON into
  // `req.body` normally. This replaces a manual preParsing hook that drained
  // the stream and left req.body empty on guarded routes.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(), adapter, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  const cfg = app.get(AppConfigService);

  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCookie, { secret: cfg.get('JWT_SECRET') });

  app.enableCors({
    origin: cfg.get('CORS_ORIGINS'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  if (cfg.get('SWAGGER_ENABLED')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LP Platform API')
      .setDescription('Liquidity Provider — REST + WebSocket')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Api-Key' }, 'hmac')
      .build();
    const doc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, doc, { customSiteTitle: 'LP API Docs' });

    // Persist for the docs site / SDK generation.
    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, '../../../docs/api/openapi.json');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(doc, null, 2), 'utf8');
  }

  app.enableShutdownHooks();
  await app.listen(cfg.get('PORT'), '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal bootstrap error:', err);
  process.exitCode = 1;
});
