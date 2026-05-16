import {
  executeWalletAdjust,
  type WalletAdjustPayload,
  type WalletAdjustResult,
} from './actions/wallet-adjust.js';

import type { LedgerOps } from './ledger-ops.js';

export type PendingActionType =
  | 'wallet.adjust'
  | 'charges.rate.update'
  | 'trade.reverse'
  | 'broker.suspend'
  | 'broker.limits.update';

export interface PendingAction {
  actionId: string;
  type: PendingActionType;
  payload: unknown;
}

export interface DispatcherOps {
  ledger: LedgerOps;
}

export type DispatchResult =
  | { type: 'wallet.adjust'; result: WalletAdjustResult }
  | { type: 'not_implemented'; actionType: PendingActionType };

/**
 * Route a pending action to its concrete handler. The CONSUMER is responsible
 * for transactional boundaries — the dispatcher itself does no `BEGIN`/`COMMIT`.
 * In `apps/api`, the audit-in-tx interceptor opens the tx; in `apps/workers`,
 * the approval watcher opens its own short-lived tx around the dispatch.
 *
 * Returns a tagged union so callers can branch on action type without
 * re-introducing the type→payload coupling here.
 */
export async function dispatch(action: PendingAction, ops: DispatcherOps): Promise<DispatchResult> {
  switch (action.type) {
    case 'wallet.adjust': {
      const result = await executeWalletAdjust(action.payload as WalletAdjustPayload, ops.ledger);
      return { type: 'wallet.adjust', result };
    }
    case 'charges.rate.update':
    case 'trade.reverse':
    case 'broker.suspend':
    case 'broker.limits.update':
      return { type: 'not_implemented', actionType: action.type };
  }
}
