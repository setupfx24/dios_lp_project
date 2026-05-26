'use client';

import { Activity, TrendingDown, TrendingUp, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { LineData, UTCTimestamp } from 'lightweight-charts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { PnlChart } from '@/features/positions/pnl-chart';
import { formatMoney } from '@/lib/format';
import { getSocket } from '@/lib/socket';

export default function PositionsPage() {
  const [series, setSeries] = useState<LineData[]>([]);
  const [latest, setLatest] = useState<number | null>(null);
  const [peak, setPeak] = useState<number | null>(null);
  const [trough, setTrough] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onPosition(evt: { brokerId: string; pnl?: string }) {
      const value = Number(evt.pnl ?? '0');
      setLatest(value);
      setPeak((p) => (p === null ? value : Math.max(p, value)));
      setTrough((t) => (t === null ? value : Math.min(t, value)));
      setSeries((s) => [
        ...s.slice(-199),
        { time: Math.floor(Date.now() / 1000) as UTCTimestamp, value },
      ]);
    }

    setConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('position.updated', onPosition);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('position.updated', onPosition);
    };
  }, []);

  const pnlTone = latest === null ? 'default' : latest >= 0 ? 'positive' : 'negative';

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Positions</h1>
          <p className="text-sm text-muted-foreground">
            Realtime P&amp;L stream via WebSocket. Updates push automatically as trades execute.
          </p>
        </div>
        <span
          className={
            connected
              ? 'inline-flex items-center gap-1 self-start rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'inline-flex items-center gap-1 self-start rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
          }
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connected ? 'Live' : 'Disconnected'}
        </span>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Current P&L"
          value={latest === null ? '—' : formatMoney(String(latest))}
          icon={Activity}
          tone={pnlTone}
          hint={series.length > 0 ? `${series.length} updates received` : 'waiting for first tick'}
        />
        <StatCard
          label="Session High"
          value={peak === null ? '—' : formatMoney(String(peak))}
          icon={TrendingUp}
          tone="positive"
        />
        <StatCard
          label="Session Low"
          value={trough === null ? '—' : formatMoney(String(trough))}
          icon={TrendingDown}
          tone="negative"
        />
        <StatCard
          label="Range"
          value={peak === null || trough === null ? '—' : formatMoney(String(peak - trough))}
          icon={Activity}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Realtime P&amp;L</CardTitle>
        </CardHeader>
        <CardContent>
          <PnlChart data={series} />
          {series.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No data yet — chart will populate as the worker emits <code>position.updated</code>{' '}
              events.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
