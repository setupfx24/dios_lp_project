'use client';

import { Activity, BarChart3, Download, Search, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { TradeRecordDto } from '@lp/sdk';

import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  Td,
  Th,
} from '@/components/dash/ui';
import { useTrades } from '@/features/trades/use-trades';
import { formatDateTime } from '@/lib/format';

function usd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TradesPage() {
  const { data, isLoading, error } = useTrades({ limit: 500 });
  const [q, setQ] = useState('');
  const [side, setSide] = useState<'all' | 'BUY' | 'SELL'>('all');

  const all = data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((t) => {
      if (side !== 'all' && t.side !== side) return false;
      if (
        needle &&
        !(t.symbol.toLowerCase().includes(needle) || t.tradeId.toLowerCase().includes(needle))
      )
        return false;
      return true;
    });
  }, [all, q, side]);

  const totalVolume = all.reduce((s, t) => s + Number(t.quantity), 0);
  const notional = all.reduce((s, t) => s + Number(t.quantity) * Number(t.price), 0);
  const buys = all.filter((t) => t.side === 'BUY').length;
  const sells = all.length - buys;

  return (
    <div>
      <PageHeader
        title="Trades"
        subtitle="Executed trades — append-only and hash-chained on the server."
        actions={<CsvButton trades={all} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total Trades" value={all.length} accent="white" icon={Activity} />
        <StatCard label="Buy" value={buys} accent="green" />
        <StatCard label="Sell" value={sells} accent="red" />
        <StatCard
          label="Total Volume"
          value={totalVolume.toLocaleString()}
          accent="purple"
          icon={BarChart3}
        />
        <StatCard label="Notional" value={usd(notional)} accent="cyan" icon={TrendingUp} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by symbol or trade ID…"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'BUY', 'SELL'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                side === s
                  ? s === 'BUY'
                    ? 'bg-green-600 text-white'
                    : s === 'SELL'
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && (
        <p className="text-sm text-red-400">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}
      {data &&
        (filtered.length === 0 ? (
          <Card>
            <EmptyState icon={Activity} title="No trades match your filters" />
          </Card>
        ) : (
          <DataTable>
            <thead className="border-b border-zinc-800 bg-zinc-800/40">
              <tr>
                <Th>Time</Th>
                <Th>Trade ID</Th>
                <Th>Symbol</Th>
                <Th>Side</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.tradeId} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                  <Td className="whitespace-nowrap text-zinc-400">
                    {formatDateTime(t.executedAt)}
                  </Td>
                  <Td className="font-mono text-xs">{t.tradeId}</Td>
                  <Td>{t.symbol}</Td>
                  <Td>
                    <Badge color={t.side === 'BUY' ? 'green' : 'red'}>{t.side}</Badge>
                  </Td>
                  <Td className="text-right">{t.quantity}</Td>
                  <Td className="text-right">{t.price}</Td>
                  <Td className="text-right font-medium">
                    {usd(Number(t.quantity) * Number(t.price))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ))}
      <p className="mt-3 text-xs text-zinc-500">
        Showing {filtered.length} of {all.length} trades.
      </p>
    </div>
  );
}

function CsvButton({ trades }: { trades: readonly TradeRecordDto[] }) {
  const csv = useMemo(() => {
    const header = ['executedAt', 'tradeId', 'orderId', 'symbol', 'side', 'quantity', 'price'];
    const lines = [header.join(',')];
    for (const r of trades) {
      lines.push(
        [r.executedAt, r.tradeId, r.orderId, r.symbol, r.side, r.quantity, r.price]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(','),
      );
    }
    return lines.join('\n');
  }, [trades]);

  return (
    <a
      href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
      download="trades.csv"
      className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
    >
      <Download className="h-4 w-4" /> Export CSV
    </a>
  );
}
