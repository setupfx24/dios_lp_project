export type LedgerEntryDirection = 'DEBIT' | 'CREDIT';

export interface WalletRecord {
  readonly walletId: string;
  readonly brokerId: string;
  readonly currency: string;
  /** Computed; not authoritative. Authoritative balance comes from sum of ledger entries. */
  readonly balance: string;
  readonly updatedAt: string;
}

export interface LedgerEntryRecord {
  readonly entryId: string;
  readonly walletId: string;
  readonly direction: LedgerEntryDirection;
  /** Stringified decimal, always positive. Sign is in `direction`. */
  readonly amount: string;
  readonly currency: string;
  readonly referenceType: 'TRADE' | 'CHARGE' | 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT';
  readonly referenceId: string;
  readonly description: string;
  readonly createdAt: string;
}
