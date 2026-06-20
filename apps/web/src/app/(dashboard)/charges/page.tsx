'use client';

import { FileText } from 'lucide-react';
import { useState } from 'react';

import type { CommissionDto } from '@lp/sdk';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommissions } from '@/features/account/hooks';

const PAGE_SIZE = 5;

function usd(v: string | number): string {
  const n = Number(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ChargesPage() {
  const { data, isLoading, error } = useCommissions();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const items = data?.items ?? [];

  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  const filtered = items.filter((c) => {
    const ts = new Date(c.createdAt).getTime();
    if (fromTs !== null && ts < fromTs) return false;
    if (toTs !== null && ts > toTs) return false;
    return true;
  });

  const total = filtered.reduce((s, c) => s + Number(c.amount), 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const paged = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Commissions</h1>
        <PdfButton commissions={filtered} from={from} to={to} total={total} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Total Commission" value={usd(total)} accent />
        <Stat label="Charged trades" value={String(filtered.length)} />
        <Stat label="Rate" value="$4 / lot" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commission history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              aria-label="From date"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              aria-label="To date"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {(from || to) && (
              <button
                type="button"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
                className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No commissions in this view. A $4-per-standard-lot fee is charged when an A-Book
              position is opened.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Trade ID</th>
                      <th className="py-2">User</th>
                      <th className="py-2">User ID</th>
                      <th className="py-2">Symbol</th>
                      <th className="py-2">Side</th>
                      <th className="py-2 text-right">Lots</th>
                      <th className="py-2 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => (
                      <tr key={c.tradeId} className="border-t border-border">
                        <td className="whitespace-nowrap py-2 text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 font-mono text-xs">{c.tradeId}</td>
                        <td className="py-2">{c.user ?? '—'}</td>
                        <td className="py-2 font-mono text-xs">{c.userId ?? '—'}</td>
                        <td className="py-2">{c.symbol}</td>
                        <td
                          className={`py-2 ${c.side === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}
                        >
                          {c.side}
                        </td>
                        <td className="py-2 text-right">{c.quantity}</td>
                        <td className="py-2 text-right font-medium text-red-400">
                          -{usd(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Page {current} of {totalPages} · {filtered.length} total
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={current <= 1}
                      className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={current >= totalPages}
                      className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${accent ? 'text-red-400' : 'text-foreground'}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

/** Dependency-free PDF export of the (date-filtered) commission history. */
function PdfButton({
  commissions,
  from,
  to,
  total,
}: {
  commissions: readonly CommissionDto[];
  from: string;
  to: string;
  total: number;
}) {
  function download() {
    const range = from || to ? `${from || '…'} -> ${to || '…'}` : 'All dates';
    const generated = new Date().toLocaleString();
    const rows = commissions
      .map(
        (c) => `<tr>
          <td>${esc(new Date(c.createdAt).toLocaleString())}</td>
          <td class="mono">${esc(c.tradeId)}</td>
          <td>${esc(c.user ?? '—')}</td>
          <td class="mono">${esc(c.userId ?? '—')}</td>
          <td>${esc(c.symbol)}</td>
          <td>${esc(c.side)}</td>
          <td class="r">${esc(c.quantity)}</td>
          <td class="r">-${esc(Number(c.amount).toFixed(2))}</td>
        </tr>`,
      )
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Commissions report</title>
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
      <h1>Commissions report</h1>
      <div class="meta">Date range: ${esc(range)} · ${commissions.length} entries · Total $${total.toFixed(2)} · Generated ${esc(generated)}</div>
      <table>
        <thead><tr>
          <th>Date</th><th>Trade ID</th><th>User</th><th>User ID</th><th>Symbol</th>
          <th>Side</th><th class="r">Lots</th><th class="r">Commission</th>
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
