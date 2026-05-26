/**
 * Add (or update) a super-admin in the new LP. Standalone of the seed script
 * so we can mint extra ops accounts without touching demo data.
 *
 *   DATABASE_URL=postgres://lp_owner:owner_pw@localhost:5433/lp \
 *   node infra/scripts/add-admin.mjs <email> <password> [displayName]
 *
 * - Existing email → password is rotated, role/permissions left alone.
 * - New email → super_admin row inserted with TOTP enrollment forced on
 *   first login (totpVerifiedAt = NULL).
 */
import * as argon2 from 'argon2';
import pg from 'pg';

import { ulid } from '../../packages/utils/dist/id.js';

const [email, password, displayName = 'Super Admin'] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: node infra/scripts/add-admin.mjs <email> <password> [displayName]');
  process.exit(1);
}
if (password.length < 12) {
  console.error('password must be at least 12 chars (server enforces this on login schema too)');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL required (use lp_owner credentials)');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  const existing = await pool.query('SELECT user_id FROM auth.users WHERE email = $1', [
    email.toLowerCase(),
  ]);
  const hash = await argon2.hash(password);
  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE auth.users SET password_hash = $1, must_change_password = false WHERE email = $2',
      [hash, email.toLowerCase()],
    );
    console.warn(`✓ password rotated for existing admin ${email}`);
  } else {
    const userId = ulid();
    await pool.query(
      `INSERT INTO auth.users
         (user_id, email, password_hash, display_name, role, user_type, admin_role, must_change_password)
       VALUES ($1, $2, $3, $4, 'lp_admin', 'admin_user', 'super_admin', false)`,
      [userId, email.toLowerCase(), hash, displayName],
    );
    console.warn(`✓ created super_admin ${email} (userId=${userId})`);
    console.warn(`  first login will force TOTP enrollment (scan QR with authenticator app).`);
  }
} catch (err) {
  console.error('FAILED:', err.message || err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
