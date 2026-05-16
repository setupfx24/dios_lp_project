import fastifyCookie from '@fastify/cookie';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from '../../src/app.module.js';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor.js';

import {
  startTestDatabase,
  startTestRedis,
  stopTestDatabase,
  stopTestRedis,
} from './testcontainers.js';

import type { DbHandle, RedisHandle } from './testcontainers.js';

export interface E2EAppHandle {
  app: NestFastifyApplication;
  db: DbHandle;
  redis: RedisHandle;
}

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '0',
  JWT_SECRET: 'broker_test_secret_at_least_32_characters_long',
  JWT_EXPIRY: '1h',
  ADMIN_JWT_SECRET: 'admin_test_secret_at_least_32_characters_long',
  ADMIN_JWT_EXPIRY: '1h',
  ADMIN_REAUTH_WINDOW_SECONDS: '300',
  ADMIN_4EYES_THRESHOLD_PAISE: '1000000',
  ADMIN_IDLE_TIMEOUT_SECONDS: '900',
  TOTP_ENCRYPTION_KEY: 'totp_test_key_at_least_32_chars_for_aes_gcm',
  TOTP_ISSUER: 'LP Test',
  LOG_LEVEL: 'error',
  CORS_ORIGINS: 'http://localhost:3001',
  SWAGGER_ENABLED: 'false',
  HMAC_REPLAY_WINDOW_MS: '30000',
};

/**
 * Boot Postgres + Redis testcontainers, then a Nest Fastify app with
 * ROUTES_ENABLED=all so both broker and admin surfaces are exercisable.
 *
 * Sets process.env for the duration of the suite — vitest's
 * `pool: 'forks'` + `singleFork: true` keeps that safe.
 */
export async function startE2EApp(): Promise<E2EAppHandle> {
  const db = await startTestDatabase();
  const redis = await startTestRedis();

  // The Nest app reads env at module-init time. Set everything here so
  // AppConfigModule's Zod validation passes.
  process.env.DATABASE_URL = db.url; // run as lp_owner so tests can also act as admin
  process.env.REDIS_URL = redis.url;
  process.env.ROUTES_ENABLED = 'all';
  for (const [k, v] of Object.entries(TEST_ENV)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }

  const adapter = new FastifyAdapter({ logger: false });
  // Capture raw body for HMAC tests (matches main.ts behavior).
  adapter.getInstance().addHook('preParsing', (req, _reply, payload, done) => {
    const chunks: Buffer[] = [];
    payload.on('data', (chunk: Buffer) => chunks.push(chunk));
    payload.on('end', () => {
      (req as { rawBody?: string }).rawBody = Buffer.concat(chunks).toString('utf8');
    });
    done(null, payload);
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(), adapter, {
    logger: false,
  });
  await app.register(fastifyCookie, { secret: process.env.JWT_SECRET! });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, db, redis };
}

export async function stopE2EApp(h: E2EAppHandle): Promise<void> {
  await h.app.close();
  await stopTestRedis(h.redis);
  await stopTestDatabase(h.db);
}
