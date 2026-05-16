import { describe, expect, it, vi } from 'vitest';

import { dispatch } from './dispatcher.js';

import type { LedgerOps } from './ledger-ops.js';

const noopLedger: LedgerOps = {
  findOrCreateWallet: vi.fn(() => Promise.resolve({ walletId: 'w-1' })),
  postPair: vi.fn(() => Promise.resolve([{ entryId: 'e-1' }, { entryId: 'e-2' }])),
};

describe('dispatch', () => {
  it('routes wallet.adjust to executeWalletAdjust', async () => {
    const out = await dispatch(
      {
        actionId: 'a-1',
        type: 'wallet.adjust',
        payload: {
          brokerId: 'b1',
          direction: 'CREDIT',
          amount: '100',
          currency: 'INR',
          reason: 'test',
        },
      },
      { ledger: noopLedger },
    );
    expect(out.type).toBe('wallet.adjust');
    if (out.type === 'wallet.adjust') {
      expect(out.result.entryIds).toHaveLength(2);
    }
  });

  it.each([
    'charges.rate.update',
    'trade.reverse',
    'broker.suspend',
    'broker.limits.update',
  ] as const)('returns not_implemented for %s (placeholder)', async (type) => {
    const out = await dispatch({ actionId: 'a-1', type, payload: {} }, { ledger: noopLedger });
    expect(out.type).toBe('not_implemented');
    if (out.type === 'not_implemented') {
      expect(out.actionType).toBe(type);
    }
  });
});
