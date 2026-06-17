'use client';

import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSocket } from '@/lib/socket';

interface Position {
  tradeId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  openPrice: string;
  currentPrice: string;
  floatingPnl: string;
}

interface Snapshot {
  brokerId: string;
  positions: Position[];
  totalPnl: string;
  ts: string;
}

function fmtPnl(v: string | number): string {
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

/**
 * Live blotter of open A-Book positions. The upstream broker (dios) pushes a
 * mark-to-market snapshot every ~2s; the API rebroadcasts it on this broker's
 * websocket room as `positions.snapshot`, so current price + floating P&L tick
 * with the market in real time.
 */
export default function PositionsPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const socket = getSocket();
    function onSnapshot(evt: Snapshot) {
      setSnap(evt);
    }
    socket.on('positions.snapshot', onSnapshot);
    return () => {
      socket.off('positions.snapshot', onSnapshot);
    };
  }, []);

  const positions = snap?.positions ?? [];
  const totalPnl = snap ? Number(snap.totalPnl) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Open Positions</h1>
        <span className="text-sm text-muted-foreground">
          {snap
            ? `Live · updated ${new Date(snap.ts).toLocaleTimeString()}`
            : 'Waiting for live feed…'}
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
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open positions. Live prices appear here as A-Book trades open, and the floating
              P&amp;L ticks with the market.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
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
                {positions.map((p) => {
                  const pnl = Number(p.floatingPnl);
                  return (
                    <tr key={p.tradeId} className="border-t border-border">
                      <td className="py-2 font-mono text-xs">{p.tradeId}</td>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
