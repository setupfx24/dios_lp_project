import { sql } from 'drizzle-orm';
import { bigint, boolean, index, pgEnum, text, timestamp } from 'drizzle-orm/pg-core';

import { auth } from '../../../database/schemas.js';

/**
 * High-level type of the user. The legacy `role` column is kept for
 * broker-side authorization (matches the JWT payload). Admins live in
 * the SAME `auth.users` table but with `user_type = 'admin_user'` and
 * an `admin_role` set in the admin-only columns below.
 */
export const userTypeEnum = pgEnum('user_type', ['broker_user', 'admin_user']);

export const userRoleEnum = pgEnum('user_role', [
  'broker_user',
  'lp_admin',
  'lp_operator',
  'lp_readonly',
]);

/**
 * Permission tier inside the admin app. Independent of the legacy
 * `userRoleEnum` so admin permissions can evolve without churning broker
 * authz.
 */
export const adminRoleEnum = pgEnum('admin_role', ['super_admin', 'ops', 'support', 'read_only']);

export const users = auth.table(
  'users',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    userId: text('user_id').notNull().unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: userRoleEnum('role').notNull(),
    userType: userTypeEnum('user_type').notNull().default('broker_user'),
    brokerId: text('broker_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    // ---- Admin-only columns (NULL for broker users) ----
    adminRole: adminRoleEnum('admin_role'),
    /** AES-256-GCM ciphertext of the TOTP shared secret. */
    totpSecretEnc: text('totp_secret_enc'),
    /** Set the first time the admin completes 2FA verification. */
    totpVerifiedAt: timestamp('totp_verified_at', { withTimezone: true }),
    /** Argon2 hashes of single-use recovery codes. */
    recoveryCodesHash: text('recovery_codes_hash').array(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  },
  (t) => ({
    idxBroker: index('idx_users_broker').on(t.brokerId),
    idxRole: index('idx_users_role').on(t.role),
    idxType: index('idx_users_type').on(t.userType),
  }),
);

/**
 * Broker dashboard sessions. Refresh tokens, optional 1-hour idle.
 */
export const sessions = auth.table(
  'sessions',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    sessionId: text('session_id').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.userId, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (t) => ({
    idxUser: index('idx_sessions_user').on(t.userId),
  }),
);

/**
 * Admin sessions are SEPARATE from broker sessions:
 *   - different cookie name (lp_admin_access)
 *   - different JWT secret (ADMIN_JWT_SECRET)
 *   - 15-minute idle timeout (lastActivityAt)
 *   - tracks 2FA verification per session (totpVerifiedAt)
 *   - tracks reauth window for sensitive actions (reauthTokenHash, reauthValidUntil)
 *
 * Compromise of a broker session cannot promote into admin and vice versa.
 */
export const adminSessions = auth.table(
  'admin_sessions',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    sessionId: text('session_id').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.userId, { onDelete: 'cascade' }),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    totpVerifiedAt: timestamp('totp_verified_at', { withTimezone: true }),
    reauthTokenHash: text('reauth_token_hash'),
    reauthValidUntil: timestamp('reauth_valid_until', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (t) => ({
    idxUser: index('idx_admin_sessions_user').on(t.userId),
    idxActivity: index('idx_admin_sessions_activity').on(t.lastActivityAt),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type AdminSessionRow = typeof adminSessions.$inferSelect;
export type NewAdminSessionRow = typeof adminSessions.$inferInsert;
