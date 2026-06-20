'use client';

import { DEPOSIT_METHODS, type DepositMethod } from '@lp/sdk';
import { FileText, Minus, Plus, Wallet as WalletIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge, Card, Loader, PageHeader } from '@/components/dash/ui';
import {
  useCreateDepositRequest,
  useCreateWithdrawalRequest,
  useDepositRequests,
  useLedger,
  useWallet,
  useWithdrawable,
} from '@/features/account/hooks';
import { LedgerTable } from '@/features/account/ledger-table';

const METHOD_LABEL: Record<string, string> = {
  card: 'Credit / Debit Card',
  bank: 'Bank Transfer',
  upi: 'UPI',
  crypto: 'Crypto',
  manual: 'Manual / Other',
};

const STATUS_COLOR: Record<string, 'green' | 'red' | 'yellow' | 'zinc'> = {
  APPROVED: 'green',
  REJECTED: 'red',
  PENDING: 'yellow',
};

const PAGE_SIZE = 5;

function paginate<T>(items: readonly T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, totalPages);
  return {
    rows: items.slice((current - 1) * size, current * size),
    current,
    totalPages,
    total: items.length,
  };
}

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

/** Dependency-free PDF export of a simple table (print-to-PDF). */
function PdfBtn({
  label,
  head,
  rows,
  from,
  to,
}: {
  label: string;
  head: string[];
  rows: string[][];
  from: string;
  to: string;
}) {
  function download() {
    const range = from || to ? `${from || '…'} -> ${to || '…'}` : 'All dates';
    const generated = new Date().toLocaleString();
    const body = rows
      .map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>${esc(label)} report</title>
      <style>
        *{font-family:Arial,Helvetica,sans-serif}
        body{margin:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:12px;color:#555;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}
        th{background:#f3f3f3}
      </style></head><body>
      <h1>${esc(label)}</h1>
      <div class="meta">Date range: ${esc(range)} · ${rows.length} entries · Generated ${esc(generated)}</div>
      <table>
        <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
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
      className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
    >
      <FileText className="h-3.5 w-3.5" /> PDF
    </button>
  );
}

function Pager({
  current,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  current: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="mt-3 flex items-center justify-between">
      <span className="text-xs text-zinc-500">
        Page {current} of {totalPages} · {total} total
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={current <= 1}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={current >= totalPages}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const wallet = useWallet();
  const ledger = useLedger(200);
  const deposits = useDepositRequests();
  const createDeposit = useCreateDepositRequest();
  const createWithdrawal = useCreateWithdrawalRequest();
  const withdrawableQ = useWithdrawable();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DepositMethod>('card');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Withdraw form (separate state).
  const [wOpen, setWOpen] = useState(false);
  const [wAmount, setWAmount] = useState('');
  const [wMethod, setWMethod] = useState<DepositMethod>('bank');
  const [wNote, setWNote] = useState('');
  const [wError, setWError] = useState<string | null>(null);
  const [depPage, setDepPage] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const withdrawable = Number(withdrawableQ.data?.withdrawable ?? '0');

  const primary = wallet.data?.wallets[0];
  const balance = primary ? Number(primary.balance) : 0;
  const currency = primary?.currency ?? 'USD';
  const allEntries = ledger.data?.items ?? [];
  const allRequests = deposits.data?.items ?? [];

  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  const inRange = (iso: string) => {
    const ts = new Date(iso).getTime();
    if (fromTs !== null && ts < fromTs) return false;
    if (toTs !== null && ts > toTs) return false;
    return true;
  };
  const entries = allEntries.filter((e) => inRange(e.createdAt));
  const requests = allRequests.filter((r) => inRange(r.createdAt));

  const depPaged = paginate(requests, depPage, PAGE_SIZE);
  const txPaged = paginate(entries, txPage, PAGE_SIZE);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d+(\.\d{1,4})?$/.test(amount) || Number(amount) <= 0) {
      setError('Enter a valid amount greater than 0.');
      return;
    }
    try {
      await createDeposit.mutateAsync({
        amount,
        method,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setAmount('');
      setNote('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    }
  }

  async function submitWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWError(null);
    if (!/^\d+(\.\d{1,4})?$/.test(wAmount) || Number(wAmount) <= 0) {
      setWError('Enter a valid amount greater than 0.');
      return;
    }
    if (Number(wAmount) > withdrawable + 1e-9) {
      setWError(`You can withdraw at most ${withdrawable.toFixed(2)} (balance above the $5,000 floor).`);
      return;
    }
    try {
      await createWithdrawal.mutateAsync({
        amount: wAmount,
        method: wMethod,
        ...(wNote.trim() ? { note: wNote.trim() } : {}),
      });
      setWAmount('');
      setWNote('');
      setWOpen(false);
    } catch (err) {
      setWError(err instanceof Error ? err.message : 'Failed to submit request');
    }
  }

  return (
    <div>
      <PageHeader
        title="Wallet"
        subtitle="Balance, deposits and transaction history"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setWOpen((v) => !v);
                setOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
            >
              <Minus className="h-4 w-4" />
              Withdraw
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen((v) => !v);
                setWOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />
              Add Funds
            </button>
          </div>
        }
      />

      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
            <WalletIcon className="text-green-500" />
          </div>
          <div>
            <p className="text-sm text-zinc-400">Available Balance</p>
            <p className="text-4xl font-bold text-white">
              $
              {balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-zinc-500">{currency} · funded and settled by your LP</p>
          </div>
        </div>
      </Card>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-400">Filter by date:</span>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => {
            setFrom(e.target.value);
            setDepPage(1);
            setTxPage(1);
          }}
          aria-label="From date"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
        />
        <span className="text-sm text-zinc-500">to</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            setDepPage(1);
            setTxPage(1);
          }}
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

      {open && (
        <Card className="mb-6">
          <h3 className="mb-1 font-semibold text-white">Add Funds</h3>
          <p className="mb-4 text-sm text-zinc-400">
            Submit a deposit request. Your LP admin reviews it and, once approved, the amount is
            credited to your wallet.
          </p>
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Amount ({currency})
                </label>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Payment Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as DepositMethod)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
                >
                  {DEPOSIT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m] ?? m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Note (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reference / transaction id / remark"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-green-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={createDeposit.isPending}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {createDeposit.isPending ? 'Submitting…' : 'Submit request'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {wOpen && (
        <Card className="mb-6">
          <h3 className="mb-1 font-semibold text-white">Withdraw funds</h3>
          <p className="mb-1 text-sm text-zinc-400">
            Submit a withdrawal request for admin approval. Only the balance above the locked
            $5,000 floor can be withdrawn.
          </p>
          <p className="mb-4 text-sm font-medium text-amber-400">
            Available to withdraw: {withdrawable.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            {currency}
          </p>
          <form className="space-y-4" onSubmit={(e) => void submitWithdraw(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Amount ({currency})
                </label>
                <input
                  inputMode="decimal"
                  value={wAmount}
                  onChange={(e) => setWAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Method</label>
                <select
                  value={wMethod}
                  onChange={(e) => setWMethod(e.target.value as DepositMethod)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  {DEPOSIT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m] ?? m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Note (optional)</label>
              <input
                value={wNote}
                onChange={(e) => setWNote(e.target.value)}
                placeholder="Bank account / UPI id / remark"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
            {wError && <p className="text-sm text-red-400">{wError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={createWithdrawal.isPending || withdrawable <= 0}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {createWithdrawal.isPending ? 'Submitting…' : 'Submit withdrawal'}
              </button>
              <button
                type="button"
                onClick={() => setWOpen(false)}
                className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Deposit &amp; withdrawal requests</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{requests.length} requests</span>
            <PdfBtn
              label="Deposit & withdrawal requests"
              from={from}
              to={to}
              head={['Date', 'Type', 'Method', 'Amount', 'Note', 'Status']}
              rows={requests.map((r) => [
                new Date(r.createdAt).toLocaleString(),
                r.kind === 'withdrawal' ? 'Withdrawal' : 'Deposit',
                METHOD_LABEL[r.method] ?? r.method,
                `${Number(r.amount).toFixed(2)} ${r.currency}`,
                r.note ?? '—',
                r.status,
              ])}
            />
          </div>
        </div>
        {deposits.isLoading ? (
          <Loader label="Loading deposit requests…" />
        ) : requests.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No requests yet. Use “Add Funds” or “Withdraw” to submit one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Note</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {depPaged.rows.map((r) => (
                  <tr key={r.requestId} className="border-t border-zinc-800">
                    <td className="whitespace-nowrap py-2 text-zinc-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2">
                      <Badge color={r.kind === 'withdrawal' ? 'yellow' : 'green'}>
                        {r.kind === 'withdrawal' ? 'Withdrawal' : 'Deposit'}
                      </Badge>
                    </td>
                    <td className="py-2 text-zinc-300">{METHOD_LABEL[r.method] ?? r.method}</td>
                    <td className="py-2 text-right font-medium text-white">
                      {Number(r.amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {r.currency}
                    </td>
                    <td className="py-2 text-zinc-400">{r.note ?? '—'}</td>
                    <td className="py-2">
                      <Badge color={STATUS_COLOR[r.status] ?? 'zinc'}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager
              current={depPaged.current}
              totalPages={depPaged.totalPages}
              total={depPaged.total}
              onPrev={() => setDepPage((p) => Math.max(1, p - 1))}
              onNext={() => setDepPage((p) => p + 1)}
            />
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Transaction history</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{entries.length} entries</span>
            <PdfBtn
              label="Transaction history"
              from={from}
              to={to}
              head={['Type', 'Amount', 'Reference', 'Description', 'Date']}
              rows={entries.map((e) => [
                e.direction,
                `${e.direction === 'CREDIT' ? '+' : '-'}${e.amount} ${e.currency}`,
                e.referenceType,
                e.description,
                new Date(e.createdAt).toLocaleString(),
              ])}
            />
          </div>
        </div>
        {ledger.isLoading ? (
          <Loader label="Loading transactions…" />
        ) : (
          <>
            <LedgerTable entries={txPaged.rows} />
            <Pager
              current={txPaged.current}
              totalPages={txPaged.totalPages}
              total={txPaged.total}
              onPrev={() => setTxPage((p) => Math.max(1, p - 1))}
              onNext={() => setTxPage((p) => p + 1)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
