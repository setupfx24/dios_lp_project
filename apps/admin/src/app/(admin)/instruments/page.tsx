'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/sdk';

function categorize(symbol: string): 'Crypto' | 'Metal' | 'Forex' {
  const s = symbol.toUpperCase();
  if (/^(BTC|ETH|BNB|SOL|XRP|ADA|DOGE|LTC)/.test(s)) return 'Crypto';
  if (/^(XAU|XAG|XPT|XPD)/.test(s)) return 'Metal';
  return 'Forex';
}

export default function InstrumentsPage() {
  const q = useQuery({ queryKey: ['admin-instruments'], queryFn: () => adminApi.instruments() });
  const items = q.data?.items ?? [];
  const forex = items.filter((i) => categorize(i.symbol) === 'Forex').length;
  const crypto = items.filter((i) => categorize(i.symbol) === 'Crypto').length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary">Instruments &amp; Market Data</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total Instruments" value={String(items.length)} />
        <Stat label="Forex Pairs" value={String(forex)} />
        <Stat label="Crypto Assets" value={String(crypto)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instruments</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No instruments yet — they appear here as trades are forwarded.
            </p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Symbol</th>
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Last Price</th>
                  <th className="py-2 text-right">Trades</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.symbol} className="border-t border-border">
                    <td className="py-2 font-medium text-foreground">{i.symbol}</td>
                    <td className="py-2 text-muted-foreground">{categorize(i.symbol)}</td>
                    <td className="py-2 text-right">{i.lastPrice}</td>
                    <td className="py-2 text-right">{i.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
