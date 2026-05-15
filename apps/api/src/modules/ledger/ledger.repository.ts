import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { ulid } from '@lp/utils';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import {
  ledgerEntries,
  wallets,
  type LedgerEntryRow,
  type NewLedgerEntryRow,
  type WalletRow,
} from './schema/ledger.schema.js';

export interface PostingInput {
  walletId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  currency: string;
  referenceType: 'TRADE' | 'CHARGE' | 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT';
  referenceId: string;
  description: string;
}

@Injectable()
export class LedgerRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async findOrCreateWallet(brokerId: string, currency: string, tx?: Db): Promise<WalletRow> {
    const exec = tx ?? this.db;
    const existing = await exec
      .select()
      .from(wallets)
      .where(sql`${wallets.brokerId} = ${brokerId} AND ${wallets.currency} = ${currency}`)
      .limit(1);
    if (existing[0]) {
      return existing[0];
    }
    const inserted = await exec
      .insert(wallets)
      .values({ walletId: ulid(), brokerId, currency })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('LedgerRepository.findOrCreateWallet: insert returned no rows');
    }
    return row;
  }

  async postPair(legA: PostingInput, legB: PostingInput, tx?: Db): Promise<LedgerEntryRow[]> {
    const exec = tx ?? this.db;
    const rows: NewLedgerEntryRow[] = [legA, legB].map((leg) => ({
      entryId: ulid(),
      walletId: leg.walletId,
      direction: leg.direction,
      amount: leg.amount,
      currency: leg.currency,
      referenceType: leg.referenceType,
      referenceId: leg.referenceId,
      description: leg.description,
    }));
    return exec.insert(ledgerEntries).values(rows).returning();
  }

  async getBalance(walletId: string): Promise<string> {
    const result = await this.db.execute(sql<{ balance: string }>`
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::text AS balance
      FROM ledger.ledger_entries
      WHERE wallet_id = ${walletId}
    `);
    const first = (result as unknown as { rows?: { balance: string }[] }).rows?.[0];
    return first?.balance ?? '0';
  }

  async findEntriesByWallet(walletId: string): Promise<LedgerEntryRow[]> {
    return this.db.select().from(ledgerEntries).where(eq(ledgerEntries.walletId, walletId));
  }
}
