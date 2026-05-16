import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '../../src/database/migrations');
const securityFolder = join(migrationsFolder, 'security');

export interface DbHandle {
  container: StartedTestContainer;
  pool: pg.Pool;
  url: string;
}

/**
 * Spin up a Postgres+TimescaleDB container, apply drizzle migrations and the
 * hand-written security migration. Returned pool is connected as `lp_owner`
 * (privileged for DDL). Tests that need to verify append-only enforcement
 * should reconnect as `lp_app`.
 */
export async function startTestDatabase(): Promise<DbHandle> {
  const container = await new GenericContainer('timescale/timescaledb-ha:pg16')
    .withEnvironment({
      POSTGRES_USER: 'lp_owner',
      POSTGRES_PASSWORD: 'owner_pw',
      POSTGRES_DB: 'lp_test',
    })
    .withExposedPorts(5432)
    .withStartupTimeout(120_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const url = `postgres://lp_owner:owner_pw@${host}:${port}/lp_test`;

  const pool = new pg.Pool({ connectionString: url, max: 4 });
  // Wait until Postgres accepts connections (the container reports ready
  // before pg is actually listening on a few platforms).
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });

  for (const file of (await readdir(securityFolder).catch(() => []))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sqlText = await readFile(join(securityFolder, file), 'utf8');
    await pool.query(sqlText);
  }

  return { container, pool, url };
}

export async function stopTestDatabase(h: DbHandle): Promise<void> {
  await h.pool.end();
  await h.container.stop({ timeout: 5_000 });
}

export function appUserUrl(h: DbHandle): string {
  // Same DB, different role — used to verify lp_app cannot UPDATE/DELETE
  // append-only tables.
  const url = new URL(h.url);
  url.username = 'lp_app';
  url.password = 'changeme_in_compose_env';
  return url.toString();
}

export interface RedisHandle {
  container: StartedTestContainer;
  url: string;
}

export async function startTestRedis(): Promise<RedisHandle> {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .withStartupTimeout(60_000)
    .start();
  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  return { container, url };
}

export async function stopTestRedis(h: RedisHandle): Promise<void> {
  await h.container.stop({ timeout: 5_000 });
}
