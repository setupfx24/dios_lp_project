'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/sdk';

function usd(v: string | number): string {
  const n = Number(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ABookTradesPage() {
  const q = useQuery({ queryKey: ['admin-abook-trades'], queryFn: () => adminApi.aBookTrades() });
  const items = q.data?.items ?? [];
  const buys = items.filter((t) => t.side === 'BUY').length;
  const volume = items.reduce((s, t) => s + Number(t.quantity), 0);

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
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No A-Book trades yet.</p>
          ) : (
            <table className="w-full text-sm">
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
                {items.map((t) => (
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
