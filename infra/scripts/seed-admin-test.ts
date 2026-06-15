// Local-only helper: create a super admin to log into the swistrade admin portal.
// Run with DATABASE_URL pointing at lp_owner. Safe to re-run (upserts password).
import * as argon2 from 'argon2';
import pg from 'pg';

import { ulid } from '../../packages/utils/dist/id.js';

const EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@lp.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin12345!';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    const hash = await argon2.hash(PASSWORD);
    await c.query(
      `INSERT INTO auth.users (user_id, email, password_hash, display_name, role, user_type, admin_role, must_change_password)
       VALUES ($1,$2,$3,'Super Admin','lp_admin','admin_user','super_admin',false)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, must_change_password = false`,
      [ulid(), EMAIL, hash],
    );
    console.log(`ADMIN SEEDED: ${EMAIL} / ${PASSWORD}`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
