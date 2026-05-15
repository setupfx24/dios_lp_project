import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import {
  adminSessions,
  users,
  type AdminSessionRow,
  type NewAdminSessionRow,
  type UserRow,
} from '../../auth/schema/user.schema.js';

@Injectable()
export class AdminAuthRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async findAdminByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, email.toLowerCase()),
          eq(users.userType, 'admin_user'),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findAdminByUserId(userId: string): Promise<UserRow | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(
        and(eq(users.userId, userId), eq(users.userType, 'admin_user'), isNull(users.deletedAt)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async createSession(input: NewAdminSessionRow): Promise<AdminSessionRow> {
    const inserted = await this.db.insert(adminSessions).values(input).returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('AdminAuthRepository.createSession: no row returned');
    }
    return row;
  }

  async findSession(sessionId: string): Promise<AdminSessionRow | null> {
    const rows = await this.db
      .select()
      .from(adminSessions)
      .where(and(eq(adminSessions.sessionId, sessionId), isNull(adminSessions.revokedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async markTotpVerified(sessionId: string): Promise<void> {
    await this.db
      .update(adminSessions)
      .set({ totpVerifiedAt: new Date(), lastActivityAt: new Date() })
      .where(eq(adminSessions.sessionId, sessionId));
  }

  async bumpActivity(sessionId: string): Promise<void> {
    await this.db
      .update(adminSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(adminSessions.sessionId, sessionId));
  }

  async setReauth(sessionId: string, hash: string, validUntil: Date): Promise<void> {
    await this.db
      .update(adminSessions)
      .set({ reauthTokenHash: hash, reauthValidUntil: validUntil })
      .where(eq(adminSessions.sessionId, sessionId));
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.sessionId, sessionId));
  }

  async updateUserTotp(userId: string, ciphertext: string): Promise<void> {
    await this.db.update(users).set({ totpSecretEnc: ciphertext }).where(eq(users.userId, userId));
  }

  async finalizeTotp(userId: string, recoveryCodeHashes: string[]): Promise<void> {
    await this.db
      .update(users)
      .set({
        totpVerifiedAt: new Date(),
        recoveryCodesHash: recoveryCodeHashes,
      })
      .where(eq(users.userId, userId));
  }

  async consumeRecoveryCode(userId: string, idx: number): Promise<void> {
    // Postgres array indexing is 1-based; we shift idx (0-based) accordingly.
    await this.db.execute(
      sql`UPDATE auth.users
          SET recovery_codes_hash = array_remove(recovery_codes_hash, recovery_codes_hash[${idx + 1}])
          WHERE user_id = ${userId}`,
    );
  }
}
