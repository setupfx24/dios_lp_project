'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { lp } from '@/lib/sdk';

function fmtPnl(v: string | number): string {
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

/**
 * Live blotter of open A-Book positions. Polls the cached mark-to-market
 * snapshot every 2s (the upstream broker pushes it to the API). HTTP polling is
 * resilient to websocket hiccups, so the blotter always shows current state.
 */
export default function PositionsPage() {
  const q = useQuery({
    queryKey: ['positions'],
    queryFn: () => lp.getPositions(),
    refetchInterval: 2000,
  });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const positions = q.data?.positions ?? [];
  const totalPnl = q.data ? Number(q.data.totalPnl) : 0;
  const totalPages = Math.max(1, Math.ceil(positions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = positions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Open Positions</h1>
        <span className="text-sm text-muted-foreground">
          {q.data ? `Live · updated ${new Date(q.data.ts).toLocaleTimeString()}` : 'Connecting…'}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Live blotter — total floating P&amp;L</span>
            <span className={totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}>
              {fmtPnl(totalPnl)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading live positions…</span>
            </div>
          ) : positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open positions. Live prices appear here as A-Book trades open, and the floating
              P&amp;L ticks with the market.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Trade ID</th>
                    <th className="py-2">User</th>
                    <th className="py-2">Symbol</th>
                    <th className="py-2">Side</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Open</th>
                    <th className="py-2 text-right">Current</th>
                    <th className="py-2 text-right">Floating P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => {
                    const pnl = Number(p.floatingPnl);
                    return (
                      <tr key={p.tradeId} className="border-t border-border">
                        <td className="py-2 font-mono text-xs">{p.tradeId}</td>
                        <td className="py-2">{p.userLabel ?? '—'}</td>
                        <td className="py-2">{p.symbol}</td>
                        <td
                          className={`py-2 ${p.side === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}
                        >
                          {p.side}
                        </td>
                        <td className="py-2 text-right">{p.quantity}</td>
                        <td className="py-2 text-right">{p.openPrice}</td>
                        <td className="py-2 text-right font-medium">{p.currentPrice}</td>
                        <td
                          className={`py-2 text-right font-medium ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                        >
                          {fmtPnl(p.floatingPnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {positions.length > 0 && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages} · {positions.length} open
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
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
