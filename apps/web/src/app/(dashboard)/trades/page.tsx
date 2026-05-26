'use client';

import { Activity, ArrowDownUp, Hash, Layers } from 'lucide-react';

import { StatCard } from '@/components/ui/stat-card';
import { useTradeStats } from '@/features/dashboard/use-stats';
import { TradesTable } from '@/features/trades/trades-table';
import { useTrades } from '@/features/trades/use-trades';
import { formatDateTime, formatMoney } from '@/lib/format';

export default function TradesPage() {
  const { data, isLoading, error } = useTrades({ limit: 100 });
  const { data: stats } = useTradeStats();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Trades</h1>
        <p className="text-sm text-muted-foreground">
          Read-only history. Append-only on the server — corrections appear as reversal entries.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Trades"
          value={(stats?.totalTrades ?? 0).toLocaleString('en-IN')}
          icon={Hash}
          tone="info"
        />
        <StatCard
          label="Turnover"
          value={formatMoney(stats?.totalTurnover ?? '0')}
          hint={`${stats?.distinctSymbols ?? 0} symbol${(stats?.distinctSymbols ?? 0) === 1 ? '' : 's'}`}
          icon={ArrowDownUp}
          tone="positive"
        />
        <StatCard
          label="Total Quantity"
          value={stats ? Number(stats.totalQuantity).toLocaleString('en-IN') : '—'}
          icon={Layers}
        />
        <StatCard
          label="Last Trade"
          value={stats?.lastExecutedAt ? formatDateTime(stats.lastExecutedAt) : '—'}
          icon={Activity}
          tone="default"
        />
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          Failed to load trades: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      ) : data ? (
        <TradesTable trades={data.items} />
      ) : null}
    </div>
  );
}
