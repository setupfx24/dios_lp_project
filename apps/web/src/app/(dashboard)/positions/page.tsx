'use client';

import { useEffect, useState } from 'react';

import type { LineData, UTCTimestamp } from 'lightweight-charts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PnlChart } from '@/features/positions/pnl-chart';
import { getSocket } from '@/lib/socket';

export default function PositionsPage() {
  const [series, setSeries] = useState<LineData[]>([]);

  useEffect(() => {
    const socket = getSocket();
    function onPosition(evt: { brokerId: string; pnl?: string }) {
      const value = Number(evt.pnl ?? '0');
      setSeries((s) => [
        ...s.slice(-199),
        { time: Math.floor(Date.now() / 1000) as UTCTimestamp, value },
      ]);
    }
    socket.on('position.updated', onPosition);
    return () => {
      socket.off('position.updated', onPosition);
    };
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Positions</h1>
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
