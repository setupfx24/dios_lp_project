import { ulid } from '@lp/utils/id';
import { Money } from '@lp/utils/money';

import type { LedgerDirection, LedgerOps } from '../ledger-ops.js';

export interface WalletAdjustPayload {
  brokerId: string;
  direction: LedgerDirection;
  /** Stringified positive decimal in major units (rupees). */
  amount: string;
  currency: string;
  reason: string;
}

export interface WalletAdjustResult {
  entryIds: readonly string[];
  walletId: string;
  referenceId: string;
}

/**
 * Single source of truth for "execute a wallet adjustment". Used by:
 *   - apps/api InterventionsController (below-threshold synchronous path)
 *   - apps/workers ApprovalWatcher    (post-approval async path)
 *
 * Stateless: takes the inputs and a thin `LedgerOps` adapter; emits an
 * atomic debit + credit pair (the contra leg is mirrored against the
 * broker's own wallet — see ADR-0007 follow-up about routing to an
 * internal operations wallet).
 *
 * Idempotency: the caller is responsible for ensuring this is called once
 * per pending_action — the dispatcher does that by guarding on
 * `status='approved'` in the SQL update.
 */
export async function executeWalletAdjust(
  payload: WalletAdjustPayload,
  ops: LedgerOps,
): Promise<WalletAdjustResult> {
  const amount = new Money(payload.amount);
  if (amount.isZero() || amount.isNegative()) {
    throw new Error(`executeWalletAdjust: amount must be > 0, got ${payload.amount}`);
  }

  const wallet = await ops.findOrCreateWallet(payload.brokerId, payload.currency);
  const referenceId = ulid();
  const canonicalAmount = amount.toString();

  const entries = await ops.postPair(
    {
      walletId: wallet.walletId,
      direction: payload.direction,
      amount: canonicalAmount,
      currency: payload.currency,
      referenceType: 'ADJUSTMENT',
      referenceId,
      description: `admin adjust: ${payload.reason}`,
    },
    {
      walletId: wallet.walletId,
      direction: payload.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: canonicalAmount,
      currency: payload.currency,
      referenceType: 'ADJUSTMENT',
      referenceId,
      description: `admin adjust (contra): ${payload.reason}`,
    },
  );

  return {
    entryIds: entries.map((e) => e.entryId),
    walletId: wallet.walletId,
    referenceId,
  };
}
