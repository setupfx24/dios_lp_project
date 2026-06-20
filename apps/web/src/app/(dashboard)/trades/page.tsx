'use client';

import { Activity, BarChart3, FileText, Loader2, Search, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { TradeListItem } from '@lp/sdk';

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
  const [status, setStatus] = useState<'all' | 'OPEN' | 'CLOSE'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const all = data?.items ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return all.filter((t) => {
      if (side !== 'all' && t.side !== side) return false;
      const tStatus = t.clientOrderId?.endsWith('-C') ? 'CLOSE' : 'OPEN';
      if (status !== 'all' && tStatus !== status) return false;
      const ts = new Date(t.executedAt).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (
        needle &&
        !(
          t.symbol.toLowerCase().includes(needle) ||
          t.tradeId.toLowerCase().includes(needle) ||
          (t.clientUserId ?? '').toLowerCase().includes(needle) ||
          (t.clientUserLabel ?? '').toLowerCase().includes(needle)
        )
      )
        return false;
      return true;
    });
  }, [all, q, side, status, from, to]);

  // Reset to the first page whenever the filters change the result set.
  useEffect(() => {
    setPage(1);
  }, [q, side, status, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalVolume = all.reduce((s, t) => s + Number(t.quantity), 0);
  const notional = all.reduce((s, t) => s + Number(t.quantity) * Number(t.price), 0);
  const buys = all.filter((t) => t.side === 'BUY').length;
  const sells = all.length - buys;

  return (
    <div>
      <PageHeader
        title="Trades"
        subtitle="Executed trades — append-only and hash-chained on the server."
        actions={<PdfButton trades={filtered} from={from} to={to} />}
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
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | 'OPEN' | 'CLOSE')}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
        >
          <option value="all">All status</option>
          <option value="OPEN">Open trades</option>
          <option value="CLOSE">Close trades</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
          />
          <span className="text-sm text-zinc-500">to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          )}
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

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading trades…</span>
        </div>
      )}
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
                <Th>User</Th>
                <Th>User ID</Th>
                <Th>Symbol</Th>
                <Th>Side</Th>
                <Th>Status</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Charges</Th>
                <Th className="text-right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {paged.map((t) => (
                <tr key={t.tradeId} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                  <Td className="whitespace-nowrap text-zinc-400">
                    {formatDateTime(t.executedAt)}
                  </Td>
                  <Td className="font-mono text-xs">{t.tradeId}</Td>
                  <Td>{t.clientUserLabel ?? '—'}</Td>
                  <Td className="font-mono text-xs">{t.clientUserId ?? '—'}</Td>
                  <Td>{t.symbol}</Td>
                  <Td>
                    <Badge color={t.side === 'BUY' ? 'green' : 'red'}>{t.side}</Badge>
                  </Td>
                  <Td>
                    {t.clientOrderId?.endsWith('-C') ? (
                      <Badge color="red">CLOSE</Badge>
                    ) : (
                      <Badge color="green">OPEN</Badge>
                    )}
                  </Td>
                  <Td className="text-right">{t.quantity}</Td>
                  <Td className="text-right">{t.price}</Td>
                  <Td className="text-right">{usd(Number(t.chargesTotal ?? 0))}</Td>
                  <Td className="text-right font-medium">
                    {usd(Number(t.quantity) * Number(t.price))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ))}
      <div className="mt-3 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-zinc-500">
          Showing {paged.length ? (currentPage - 1) * pageSize + 1 : 0}–
          {(currentPage - 1) * pageSize + paged.length} of {filtered.length} trades.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

/**
 * Dependency-free PDF export: opens a print-styled window with the (filtered)
 * trades and triggers the browser print dialog, where the user picks
 * "Save as PDF". Reflects the active filters incl. the date range.
 */
function PdfButton({
  trades,
  from,
  to,
}: {
  trades: readonly TradeListItem[];
  from: string;
  to: string;
}) {
  function download() {
    const range = from || to ? `${from || '…'} → ${to || '…'}` : 'All dates';
    const generated = new Date().toLocaleString();
    const rows = trades
      .map((t) => {
        const value = (Number(t.quantity) * Number(t.price)).toFixed(2);
        const tStatus = t.clientOrderId?.endsWith('-C') ? 'CLOSE' : 'OPEN';
        return `<tr>
          <td>${esc(formatDateTime(t.executedAt))}</td>
          <td class="mono">${esc(t.tradeId)}</td>
          <td>${esc(t.clientUserLabel ?? '—')}</td>
          <td class="mono">${esc(t.clientUserId ?? '—')}</td>
          <td>${esc(t.symbol)}</td>
          <td>${esc(t.side)}</td>
          <td>${esc(tStatus)}</td>
          <td class="r">${esc(t.quantity)}</td>
          <td class="r">${esc(t.price)}</td>
          <td class="r">${esc(t.chargesTotal ?? '0')}</td>
          <td class="r">${esc(value)}</td>
        </tr>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Trades report</title>
      <style>
        *{font-family:Arial,Helvetica,sans-serif}
        body{margin:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:12px;color:#555;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}
        th{background:#f3f3f3}
        .r{text-align:right}.mono{font-family:Consolas,monospace}
      </style></head><body>
      <h1>Trades report</h1>
      <div class="meta">Date range: ${esc(range)} · ${trades.length} trades · Generated ${esc(generated)}</div>
      <table>
        <thead><tr>
          <th>Time</th><th>Trade ID</th><th>User</th><th>User ID</th><th>Symbol</th>
          <th>Side</th><th>Status</th><th class="r">Qty</th><th class="r">Price</th>
          <th class="r">Charges</th><th class="r">Value</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
    >
      <FileText className="h-4 w-4" /> Download PDF
    </button>
  );
}
