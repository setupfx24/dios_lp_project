'use client';

import { useEffect, useState } from 'react';

import type { OpenPositionMark } from '@lp/sdk';
import type { LineData, UTCTimestamp } from 'lightweight-charts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PnlChart } from '@/features/positions/pnl-chart';
import { PositionsBlotter } from '@/features/positions/positions-blotter';
import { lp } from '@/lib/sdk';
import { getSocket } from '@/lib/socket';

interface SnapshotEvent {
  brokerId: string;
  marks: OpenPositionMark[];
  totalUnrealizedPnl: string;
  ts: number;
}

export default function PositionsPage() {
  const [marks, setMarks] = useState<readonly OpenPositionMark[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [total, setTotal] = useState('0');
  const [series, setSeries] = useState<LineData[]>([]);

  // Seed from the cached snapshot so a reload isn't blank for a tick.
  useEffect(() => {
    let active = true;
    lp.getPositions()
      .then((snap) => {
        if (!active) return;
        setMarks(snap.marks);
        setTotal(snap.totalUnrealizedPnl);
        setUpdatedAt(snap.ts);
      })
      .catch(() => {
        /* no snapshot yet — the next tick fills it in */
      });
    return () => {
      active = false;
    };
  }, []);

  // Live updates: each tick replaces the blotter wholesale (closed positions
  // simply drop out) and appends the running total to the P&L chart.
  useEffect(() => {
    const socket = getSocket();
    function onSnapshot(evt: SnapshotEvent) {
      setMarks(evt.marks);
      setTotal(evt.totalUnrealizedPnl);
      setUpdatedAt(evt.ts);
      const value = Number(evt.totalUnrealizedPnl);
      setSeries((s) => [
        ...s.slice(-199),
        {
          time: Math.floor((evt.ts || Date.now()) / 1000) as UTCTimestamp,
          value: Number.isFinite(value) ? value : 0,
        },
      ]);
    }
    socket.on('position.snapshot', onSnapshot);
    return () => {
      socket.off('position.snapshot', onSnapshot);
    };
  }, []);

  const totalNum = Number(total);
  const totalUp = Number.isFinite(totalNum) && totalNum >= 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Open Positions</h1>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total floating P&amp;L</div>
          <div
            className={`text-xl font-semibold tabular-nums ${
              totalUp ? 'text-emerald-500' : 'text-red-500'
            }`}
          >
            {totalUp ? '+' : ''}
            {Number.isFinite(totalNum)
              ? totalNum.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : total}
          </div>
        </div>
      </div>

      <PositionsBlotter marks={marks} updatedAt={updatedAt} />

      <Card>
        <CardHeader>
          <CardTitle>Realtime P&amp;L</CardTitle>
        </CardHeader>
        <CardContent>
          <PnlChart data={series} />
        </CardContent>
      </Card>
    </div>
  );
}
