'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { adminApi } from '@/lib/sdk';

function usd(v: string | number): string {
  const n = Number(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ABookTradesPage() {
  const q = useQuery({ queryKey: ['admin-abook-trades'], queryFn: () => adminApi.aBookTrades() });
  const [userQ, setUserQ] = useState('');
  const [status, setStatus] = useState<'all' | 'OPEN' | 'CLOSE'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const items = q.data?.items ?? [];
  const buys = items.filter((t) => t.side === 'BUY').length;
  const volume = items.reduce((s, t) => s + Number(t.quantity), 0);

  const needle = userQ.trim().toLowerCase();
  const filtered = items.filter((t) => {
    if (status !== 'all' && t.status !== status) return false;
    if (needle && !(t.user ?? '').toLowerCase().includes(needle)) return false;
    return true;
  });

  useEffect(() => {
    setPage(1);
  }, [userQ, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary">A-Book Trades</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Trades" value={String(items.length)} />
        <Stat label="Buy" value={String(buys)} />
        <Stat label="Sell" value={String(items.length - buys)} />
        <Stat label="Volume" value={volume.toLocaleString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forwarded trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <Input
              value={userQ}
              onChange={(e) => setUserQ(e.target.value)}
              placeholder="Search by user…"
              className="sm:max-w-xs"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'all' | 'OPEN' | 'CLOSE')}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All status</option>
              <option value="OPEN">Open trades</option>
              <option value="CLOSE">Close trades</option>
            </select>
          </div>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No A-Book trades match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Time</th>
                  <th className="py-2">Broker</th>
                  <th className="py-2">User</th>
                  <th className="py-2">Symbol</th>
                  <th className="py-2">Side</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Charges</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((t) => (
                  <tr key={t.tradeId} className="border-t border-border">
                    <td className="whitespace-nowrap py-2 text-muted-foreground">
                      {new Date(t.executedAt).toLocaleString()}
                    </td>
                    <td className="py-2">{t.broker}</td>
                    <td className="py-2">{t.user ?? '—'}</td>
                    <td className="py-2">{t.symbol}</td>
                    <td className={`py-2 ${t.side === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}>
                      {t.side}
                    </td>
                    <td className={`py-2 ${t.status === 'CLOSE' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {t.status}
                    </td>
                    <td className="py-2 text-right">{t.quantity}</td>
                    <td className="py-2 text-right">{t.price}</td>
                    <td className="py-2 text-right">{usd(t.charges)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          {!q.isLoading && filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages} · {filtered.length} trades
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
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
