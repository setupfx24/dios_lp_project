'use client';

import { Wallet as WalletIcon } from 'lucide-react';

import { Card, Loader, PageHeader } from '@/components/dash/ui';
import { useLedger, useWallet } from '@/features/account/hooks';
import { LedgerTable } from '@/features/account/ledger-table';

export default function WalletPage() {
  const wallet = useWallet();
  const ledger = useLedger(200);

  const primary = wallet.data?.wallets[0];
  const balance = primary ? Number(primary.balance) : 0;
  const entries = ledger.data?.items ?? [];

  return (
    <div>
      <PageHeader title="Wallet" subtitle="Balance and transaction history" />

      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
            <WalletIcon className="text-green-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-400">Available Balance</p>
            <p className="text-4xl font-bold text-white">
              $
              {balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-zinc-500">
              {primary?.currency ?? 'USD'} · funded and settled by your LP
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Transaction history</h3>
          <span className="text-xs text-zinc-500">{entries.length} entries</span>
        </div>
        {ledger.isLoading ? (
          <Loader label="Loading transactions…" />
        ) : (
          <LedgerTable entries={entries} />
        )}
      </Card>
    </div>
  );
}
