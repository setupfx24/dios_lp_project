import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

/**
 * Standalone testcontainers helper for `apps/workers`. Mirrors
 * `apps/api/test/helpers/testcontainers.ts` so workers can run e2e tests
 * without cross-app imports. Both files apply migrations from
 * `apps/api/src/database/migrations` (the single SQL source of truth).
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '../../../api/src/database/migrations');
const securityFolder = join(migrationsFolder, 'security');

export interface DbHandle {
  container: StartedTestContainer;
  pool: pg.Pool;
  url: string;
}

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
