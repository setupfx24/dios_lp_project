'use client';

import type { OpenPositionMark } from '@lp/sdk';

import { cn } from '@/lib/cn';

interface Props {
  marks: readonly OpenPositionMark[];
  updatedAt: number;
}

/** Plain number formatting (P&L is broker-wallet currency, not INR). */
function fmt(value: string, decimals = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return value;
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function PositionsBlotter({ marks, updatedAt }: Props) {
  if (marks.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        No open positions. Live trades from the broker appear here the moment they open, and update
        as the market moves.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2">Trade ID</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Open</th>
            <th className="px-3 py-2 text-right">Current</th>
            <th className="px-3 py-2 text-right">Floating P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {marks.map((m) => {
            const pnl = Number(m.unrealizedPnl);
            const up = Number.isFinite(pnl) && pnl >= 0;
            return (
              <tr key={m.clientOrderId} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{m.clientOrderId}</td>
                <td className="px-3 py-2 font-medium">{m.symbol}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-semibold',
                      m.side === 'BUY'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-red-500/10 text-red-500',
                    )}
                  >
                    {m.side}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.openPrice}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.currentPrice}</td>
                <td
                  className={cn(
                    'px-3 py-2 text-right font-semibold tabular-nums',
                    up ? 'text-emerald-500' : 'text-red-500',
                  )}
                >
                  {up ? '+' : ''}
                  {fmt(m.unrealizedPnl)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {marks.length} open position{marks.length === 1 ? '' : 's'}
        {updatedAt > 0 && <> · updated {new Date(updatedAt).toLocaleTimeString()}</>}
      </div>
    </div>
  );
}
