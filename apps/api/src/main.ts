import 'reflect-metadata';

// Make BigInt JSON-serializable (Drizzle returns bigint columns as native BigInt).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint): string {
  return this.toString();
};

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

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    logger: false, // we use nestjs-pino
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576, // 1 MB
    // Behind Cloudflare + Nginx in prod. Without trustProxy=true Fastify reports
    // every request as coming from 127.0.0.1 (the reverse proxy's loopback),
    // which breaks the throttler (one bucket for the entire internet) and the
    // audit log's ip_address column. The reverse proxy is REQUIRED to strip
    // hostile X-Forwarded-* headers before passing the request along — Nginx's
    // `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` + Cloudflare
    // dropping any incoming X-Forwarded-* from clients does this for us.
    trustProxy: true,
  });

  // Capture raw body for HMAC verification.
  adapter.getInstance().addHook('preParsing', (req, _reply, payload, done) => {
    const chunks: Buffer[] = [];
    payload.on('data', (chunk: Buffer) => chunks.push(chunk));
    payload.on('end', () => {
      (req as { rawBody?: string }).rawBody = Buffer.concat(chunks).toString('utf8');
    });
    done(null, payload);
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(), adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const cfg = app.get(AppConfigService);

  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCookie, { secret: cfg.get('COOKIE_SECRET') });

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
