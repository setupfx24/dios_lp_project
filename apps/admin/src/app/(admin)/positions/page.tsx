'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/sdk';

function fmt(value: string, decimals = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Live open-position blotter for any broker. Admin uses a separate JWT realm
 * (it can't join the broker's websocket room), so it polls the cached snapshot
 * every 2s — which is how often the upstream broker pushes a new mark anyway.
 */
export default function PositionsPage() {
  const brokers = useQuery({ queryKey: ['brokers'], queryFn: () => adminApi.listBrokers() });
  const [selected, setSelected] = useState('');
  const brokerId = selected !== '' ? selected : (brokers.data?.[0]?.brokerId ?? '');

  const positions = useQuery({
    queryKey: ['admin-positions', brokerId],
    queryFn: () => adminApi.listPositions(brokerId),
    enabled: brokerId.length > 0,
    refetchInterval: 2_000,
  });

  const marks = positions.data?.marks ?? [];
  const totalNum = Number(positions.data?.totalUnrealizedPnl ?? '0');
  const totalUp = Number.isFinite(totalNum) && totalNum >= 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">Live Positions</h1>
        <div className="flex items-center gap-3">
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={brokerId}
            onChange={(e) => setSelected(e.target.value)}
          >
            {(brokers.data ?? []).map((b) => (
              <option key={b.brokerId} value={b.brokerId}>
                {b.displayName} ({b.brokerId})
              </option>
            ))}
          </select>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total floating P&amp;L</div>
            <div
              className={`text-xl font-semibold tabular-nums ${
                totalUp ? 'text-emerald-500' : 'text-red-500'
              }`}
            >
              {totalUp ? '+' : ''}
              {fmt(positions.data?.totalUnrealizedPnl ?? '0')}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Open positions</span>
            {positions.data?.ts ? (
              <span className="text-xs font-normal text-muted-foreground">
                updated {new Date(positions.data.ts).toLocaleTimeString()}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!brokerId && <p className="text-sm text-muted-foreground">No brokers yet.</p>}
          {brokerId && marks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No open positions for this broker. Live trades appear here as they open and update as
              the market moves.
            </p>
          )}
          {marks.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2">Trade ID</th>
                  <th className="py-2">Symbol</th>
                  <th className="py-2">Side</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Open</th>
                  <th className="py-2 text-right">Current</th>
                  <th className="py-2 text-right">Floating P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {marks.map((m) => {
                  const pnl = Number(m.unrealizedPnl);
                  const up = Number.isFinite(pnl) && pnl >= 0;
                  return (
                    <tr key={m.clientOrderId} className="border-t border-border">
                      <td className="py-2 font-mono text-xs">{m.clientOrderId}</td>
                      <td className="py-2 font-medium">{m.symbol}</td>
                      <td
                        className={`py-2 font-semibold ${
                          m.side === 'BUY' ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {m.side}
                      </td>
                      <td className="py-2 text-right tabular-nums">{m.quantity}</td>
                      <td className="py-2 text-right tabular-nums">{m.openPrice}</td>
                      <td className="py-2 text-right tabular-nums">{m.currentPrice}</td>
                      <td
                        className={`py-2 text-right font-semibold tabular-nums ${
                          up ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {up ? '+' : ''}
                        {fmt(m.unrealizedPnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
