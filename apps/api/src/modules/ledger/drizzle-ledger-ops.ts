import type { LedgerRepository } from './ledger.repository.js';
import type { Db } from '../../database/connection.js';
import type { LedgerOps, PostingLeg } from '@lp/core';

/**
 * Builds a `LedgerOps` adapter backed by our Drizzle `LedgerRepository`
 * and the calling controller's transaction. Lets `@lp/core` action
 * handlers do their work without ever importing Drizzle.
 */
export function drizzleLedgerOps(repo: LedgerRepository, tx: Db): LedgerOps {
  return {
    findOrCreateWallet: async (brokerId, currency) => {
      const w = await repo.findOrCreateWallet(brokerId, currency, tx);
      return { walletId: w.walletId };
    },
    postPair: async (legA: PostingLeg, legB: PostingLeg) => {
      const rows = await repo.postPair(legA, legB, tx);
      return rows.map((r) => ({ entryId: r.entryId }));
    },
  };
}
