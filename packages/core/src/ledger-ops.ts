/**
 * Adapter the dispatcher uses for ledger writes. Two implementations live
 * outside this package:
 *   - `apps/api`  : Drizzle-backed, participates in the audit-in-tx
 *                   transaction (passed in via `tx`).
 *   - `apps/workers` : raw `pg`-backed; uses its own short-lived tx because
 *                   the worker runs OUTSIDE the audit-in-tx interceptor.
 *
 * Keeping the interface tiny means both implementations stay obviously
 * correct; nothing about ORMs, Drizzle types, or pg.Pool leaks into the
 * action handlers.
 */

export type LedgerDirection = 'DEBIT' | 'CREDIT';
export type LedgerReferenceType = 'TRADE' | 'CHARGE' | 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT';

export interface PostingLeg {
  walletId: string;
  direction: LedgerDirection;
  /** Stringified positive decimal. */
  amount: string;
  currency: string;
  referenceType: LedgerReferenceType;
  referenceId: string;
  description: string;
}

export interface PostedEntry {
  entryId: string;
}

export interface WalletRef {
  walletId: string;
}

export interface LedgerOps {
  findOrCreateWallet(brokerId: string, currency: string): Promise<WalletRef>;
  postPair(legA: PostingLeg, legB: PostingLeg): Promise<readonly PostedEntry[]>;
}
