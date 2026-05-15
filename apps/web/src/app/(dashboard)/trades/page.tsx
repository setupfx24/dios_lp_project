'use client';

import { TradesTable } from '@/features/trades/trades-table';
import { useTrades } from '@/features/trades/use-trades';

export default function TradesPage() {
  const { data, isLoading, error } = useTrades({ limit: 100 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trades</h1>
        <p className="text-sm text-muted-foreground">
          Read-only history. Append-only on the server — corrections appear as reversal entries.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load trades: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}
      {data && <TradesTable trades={data.items} />}
    </div>
  );
}
