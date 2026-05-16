import { describe, expect, it, vi } from 'vitest';

import { executeWalletAdjust } from './wallet-adjust.js';

import type { LedgerOps, PostingLeg } from '../ledger-ops.js';

function makeFakeLedger(): {
  ops: LedgerOps;
  posted: PostingLeg[][];
  wallets: { brokerId: string; currency: string; walletId: string }[];
} {
  const posted: PostingLeg[][] = [];
  const wallets: { brokerId: string; currency: string; walletId: string }[] = [];
  const ops: LedgerOps = {
    findOrCreateWallet: (brokerId: string, currency: string) => {
      const existing = wallets.find((w) => w.brokerId === brokerId && w.currency === currency);
      if (existing) {
        return Promise.resolve({ walletId: existing.walletId });
      }
      const walletId = `wallet-${wallets.length + 1}`;
      wallets.push({ brokerId, currency, walletId });
      return Promise.resolve({ walletId });
    },
    postPair: vi.fn((a: PostingLeg, b: PostingLeg) => {
      posted.push([a, b]);
      return Promise.resolve([
        { entryId: `e-${posted.length}-a` },
        { entryId: `e-${posted.length}-b` },
      ]);
    }),
  };
  return { ops, posted, wallets };
}

/** posted[i][0] / posted[i][1] are non-null after the call; narrow once. */
function legsAt(posted: PostingLeg[][], i: number): { legA: PostingLeg; legB: PostingLeg } {
  const pair = posted[i];
  if (!pair?.[0] || !pair[1]) {
    throw new Error(`posted[${i}] missing or malformed`);
  }
  return { legA: pair[0], legB: pair[1] };
}

describe('executeWalletAdjust', () => {
  it('posts a debit + matching credit on the same wallet with shared reference id', async () => {
    const { ops, posted } = makeFakeLedger();
    const result = await executeWalletAdjust(
      {
        brokerId: 'b1',
        direction: 'CREDIT',
        amount: '500.25',
        currency: 'INR',
        reason: 'manual adjust',
      },
      ops,
    );
    expect(posted).toHaveLength(1);
    const { legA, legB } = legsAt(posted, 0);
    expect(legA.direction).toBe('CREDIT');
    expect(legB.direction).toBe('DEBIT');
    expect(legA.amount).toBe('500.25');
    expect(legB.amount).toBe('500.25');
    expect(legA.referenceId).toBe(legB.referenceId);
    expect(legA.referenceType).toBe('ADJUSTMENT');
    expect(legA.walletId).toBe(legB.walletId);
    expect(result.entryIds).toEqual(['e-1-a', 'e-1-b']);
    expect(result.referenceId).toBe(legA.referenceId);
  });

  it('flips direction correctly when the request is a DEBIT', async () => {
    const { ops, posted } = makeFakeLedger();
    await executeWalletAdjust(
      { brokerId: 'b1', direction: 'DEBIT', amount: '10', currency: 'INR', reason: 'r' },
      ops,
    );
    const { legA, legB } = legsAt(posted, 0);
    expect(legA.direction).toBe('DEBIT');
    expect(legB.direction).toBe('CREDIT');
  });

  it('reuses an existing wallet for the same broker+currency', async () => {
    const { ops, wallets } = makeFakeLedger();
    await executeWalletAdjust(
      { brokerId: 'b1', direction: 'CREDIT', amount: '1', currency: 'INR', reason: 'r' },
      ops,
    );
    await executeWalletAdjust(
      { brokerId: 'b1', direction: 'CREDIT', amount: '2', currency: 'INR', reason: 'r' },
      ops,
    );
    expect(wallets).toHaveLength(1);
  });

  it('rejects zero or negative amounts', async () => {
    const { ops } = makeFakeLedger();
    await expect(
      executeWalletAdjust(
        { brokerId: 'b1', direction: 'CREDIT', amount: '0', currency: 'INR', reason: 'r' },
        ops,
      ),
    ).rejects.toThrow(/amount must be/);
    await expect(
      executeWalletAdjust(
        { brokerId: 'b1', direction: 'CREDIT', amount: '-1', currency: 'INR', reason: 'r' },
        ops,
      ),
    ).rejects.toThrow(/amount must be/);
  });

  it('rejects malformed amount strings (Money validation)', async () => {
    const { ops } = makeFakeLedger();
    await expect(
      executeWalletAdjust(
        { brokerId: 'b1', direction: 'CREDIT', amount: 'abc', currency: 'INR', reason: 'r' },
        ops,
      ),
    ).rejects.toThrow();
  });

  it('uses canonical Money.toString() (trailing zeros stripped)', async () => {
    const { ops, posted } = makeFakeLedger();
    await executeWalletAdjust(
      { brokerId: 'b1', direction: 'CREDIT', amount: '12.5000', currency: 'INR', reason: 'r' },
      ops,
    );
    const { legA, legB } = legsAt(posted, 0);
    expect(legA.amount).toBe('12.5');
    expect(legB.amount).toBe('12.5');
  });
});
