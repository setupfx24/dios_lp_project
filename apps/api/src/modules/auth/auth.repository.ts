import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import { users, type UserRow } from './schema/user.schema.js';

@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<UserRow | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.userId, userId), isNull(users.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }
}
