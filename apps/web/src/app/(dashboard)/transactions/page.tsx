'use client';

import { useState } from 'react';

import { Card, PageHeader, StatCard } from '@/components/dash/ui';
import { useLedger } from '@/features/account/hooks';
import { LedgerTable } from '@/features/account/ledger-table';

type Filter = 'all' | 'credit' | 'debit';

function usd(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionsPage() {
  const ledger = useLedger(300);
  const [filter, setFilter] = useState<Filter>('all');

  const all = ledger.data?.items ?? [];
  const credits = all
    .filter((e) => e.direction === 'CREDIT')
    .reduce((s, e) => s + Number(e.amount), 0);
  const debits = all
    .filter((e) => e.direction === 'DEBIT')
    .reduce((s, e) => s + Number(e.amount), 0);
  const net = credits - debits;
  const filtered = all.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'credit'
        ? e.direction === 'CREDIT'
        : e.direction === 'DEBIT',
  );

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Ledger entries across your wallet" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Transactions" value={all.length} accent="white" />
        <StatCard label="Total Credits" value={`+${usd(credits)}`} accent="green" />
        <StatCard label="Total Debits" value={`-${usd(debits)}`} accent="red" />
        <StatCard
          label="Net Change"
          value={`${net >= 0 ? '+' : '-'}${usd(net)}`}
          accent={net >= 0 ? 'green' : 'red'}
        />
      </div>

      <div className="mb-4 flex gap-2">
        {(['all', 'credit', 'debit'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === f
                ? f === 'credit'
                  ? 'bg-green-600 text-white'
                  : f === 'debit'
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-black'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : `${f}s`}
          </button>
        ))}
      </div>

      <Card>
        {ledger.isLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <LedgerTable entries={filtered} />
        )}
      </Card>
    </div>
  );
}
