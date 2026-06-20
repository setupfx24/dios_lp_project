'use client';

import { FileText } from 'lucide-react';
import { useState } from 'react';

import type { LedgerEntryDto } from '@lp/sdk';

import { Card, Loader, PageHeader, StatCard } from '@/components/dash/ui';
import { useLedger } from '@/features/account/hooks';
import { LedgerTable } from '@/features/account/ledger-table';
import { formatDateTime } from '@/lib/format';

type Filter = 'all' | 'credit' | 'debit';

function usd(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionsPage() {
  const ledger = useLedger(300);
  const [filter, setFilter] = useState<Filter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const all = ledger.data?.items ?? [];
  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  const filtered = all.filter((e) => {
    if (filter === 'credit' && e.direction !== 'CREDIT') return false;
    if (filter === 'debit' && e.direction !== 'DEBIT') return false;
    const ts = new Date(e.createdAt).getTime();
    if (fromTs !== null && ts < fromTs) return false;
    if (toTs !== null && ts > toTs) return false;
    return true;
  });

  // Stats reflect the active filters (date range + direction).
  const credits = filtered
    .filter((e) => e.direction === 'CREDIT')
    .reduce((s, e) => s + Number(e.amount), 0);
  const debits = filtered
    .filter((e) => e.direction === 'DEBIT')
    .reduce((s, e) => s + Number(e.amount), 0);
  const net = credits - debits;

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Ledger entries across your wallet"
        actions={<PdfButton entries={filtered} from={from} to={to} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Transactions" value={filtered.length} accent="white" />
        <StatCard label="Total Credits" value={`+${usd(credits)}`} accent="green" />
        <StatCard label="Total Debits" value={`-${usd(debits)}`} accent="red" />
        <StatCard
          label="Net Change"
          value={`${net >= 0 ? '+' : '-'}${usd(net)}`}
          accent={net >= 0 ? 'green' : 'red'}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          {(['all', 'credit', 'debit'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                filter === f
                  ? f === 'credit'
                    ? 'bg-green-600 text-white'
                    : f === 'debit'
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : `${f}s`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
          />
          <span className="text-sm text-zinc-500">to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <Card>
        {ledger.isLoading ? (
          <Loader label="Loading transactions…" />
        ) : (
          <LedgerTable entries={filtered} />
        )}
      </Card>
    </div>
  );
}

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

/**
 * Dependency-free PDF export: opens a print-styled window with the (filtered)
 * ledger entries and triggers the print dialog ("Save as PDF").
 */
function PdfButton({
  entries,
  from,
  to,
}: {
  entries: readonly LedgerEntryDto[];
  from: string;
  to: string;
}) {
  function download() {
    const range = from || to ? `${from || '…'} -> ${to || '…'}` : 'All dates';
    const generated = new Date().toLocaleString();
    const rows = entries
      .map((e) => {
        const sign = e.direction === 'CREDIT' ? '+' : '-';
        return `<tr>
          <td>${esc(e.direction)}</td>
          <td class="r">${sign}${esc(e.amount)} ${esc(e.currency)}</td>
          <td>${esc(e.referenceType)}</td>
          <td>${esc(e.description)}</td>
          <td>${esc(formatDateTime(e.createdAt))}</td>
        </tr>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Transactions report</title>
      <style>
        *{font-family:Arial,Helvetica,sans-serif}
        body{margin:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:12px;color:#555;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}
        th{background:#f3f3f3}
        .r{text-align:right}
      </style></head><body>
      <h1>Transactions report</h1>
      <div class="meta">Date range: ${esc(range)} · ${entries.length} entries · Generated ${esc(generated)}</div>
      <table>
        <thead><tr>
          <th>Type</th><th class="r">Amount</th><th>Reference</th><th>Description</th><th>Date</th>
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
