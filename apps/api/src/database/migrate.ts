/**
 * Standalone migration runner. Usage:
 *
 *   pnpm --filter @lp/api db:migrate
 *
 * Reads DATABASE_URL from env (typically set to the lp_owner credentials in
 * production — runtime uses lp_app, which lacks DDL privileges).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsFolder = join(here, 'migrations');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const db = drizzle(pool);

try {
  console.warn(`[migrate] Applying drizzle-kit migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });

  // Apply any hand-written .sql files in the security/ subfolder, in name order.
  const securityFolder = join(migrationsFolder, 'security');
  let securityFiles: string[] = [];
  try {
    securityFiles = (await readdir(securityFolder)).filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  for (const file of securityFiles) {
    const fullPath = join(securityFolder, file);
    console.warn(`[migrate] Applying security migration ${file}`);
    const sqlText = await readFile(fullPath, 'utf8');
    await pool.query(sqlText);
  }

  console.warn('[migrate] All migrations applied.');
} catch (err) {
  console.error('[migrate] FAILED:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
