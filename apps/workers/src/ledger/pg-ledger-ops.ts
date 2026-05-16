import { ulid } from '@lp/utils/id';

import type { LedgerOps, PostingLeg } from '@lp/core';
import type pg from 'pg';

/**
 * `LedgerOps` adapter for raw `pg.PoolClient` (or `pg.Pool`). Workers use
 * this because they don't go through Drizzle/Nest's audit-in-tx
 * interceptor — each call to `dispatch` opens its own short tx, and the
 * worker's caller passes the client into this constructor.
 */
export function pgLedgerOps(client: pg.PoolClient | pg.Pool): LedgerOps {
  return {
    findOrCreateWallet: async (brokerId, currency) => {
      const existing = await client.query<{ wallet_id: string }>(
        `SELECT wallet_id FROM ledger.wallets WHERE broker_id = $1 AND currency = $2 LIMIT 1`,
        [brokerId, currency],
      );
      if (existing.rows[0]) {
        return { walletId: existing.rows[0].wallet_id };
      }
      const walletId = ulid();
      await client.query(
        `INSERT INTO ledger.wallets (wallet_id, broker_id, currency)
         VALUES ($1, $2, $3)`,
        [walletId, brokerId, currency],
      );
      return { walletId };
    },
    postPair: async (legA: PostingLeg, legB: PostingLeg) => {
      const rows: { entry_id: string }[] = [];
      for (const leg of [legA, legB]) {
        const entryId = ulid();

        await client.query(
          `INSERT INTO ledger.ledger_entries
             (entry_id, wallet_id, direction, amount, currency, reference_type, reference_id, description)
           VALUES ($1, $2, $3::ledger_direction, $4, $5, $6::ledger_reference_type, $7, $8)`,
          [
            entryId,
            leg.walletId,
            leg.direction,
            leg.amount,
            leg.currency,
            leg.referenceType,
            leg.referenceId,
            leg.description,
          ],
        );
        rows.push({ entry_id: entryId });
      }
      return rows.map((r) => ({ entryId: r.entry_id }));
    },
  };
}
