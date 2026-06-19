'use client';

import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommissions } from '@/features/account/hooks';

const PAGE_SIZE = 5;

function usd(v: string | number): string {
  const n = Number(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ChargesPage() {
  const { data, isLoading, error } = useCommissions();
  const [page, setPage] = useState(1);

  const items = data?.items ?? [];
  const total = data?.total ?? '0';
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const paged = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Commissions</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Total Commission" value={usd(total)} accent />
        <Stat label="Charged trades" value={String(items.length)} />
        <Stat label="Rate" value="$4 / lot" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commission history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No commissions yet. A $4-per-standard-lot fee is charged when an A-Book position is
              opened.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2">Trade ID</th>
                    <th className="py-2">Symbol</th>
                    <th className="py-2">Side</th>
                    <th className="py-2 text-right">Lots</th>
                    <th className="py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((c) => (
                    <tr key={c.tradeId} className="border-t border-border">
                      <td className="whitespace-nowrap py-2 text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 font-mono text-xs">{c.tradeId}</td>
                      <td className="py-2">{c.symbol}</td>
                      <td
                        className={`py-2 ${c.side === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}
                      >
                        {c.side}
                      </td>
                      <td className="py-2 text-right">{c.quantity}</td>
                      <td className="py-2 text-right font-medium text-red-400">-{usd(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Page {current} of {totalPages} · {items.length} total
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={current <= 1}
                      className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={current >= totalPages}
                      className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${accent ? 'text-red-400' : 'text-foreground'}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
