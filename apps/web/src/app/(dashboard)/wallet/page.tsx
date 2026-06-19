'use client';

import { DEPOSIT_METHODS, type DepositMethod } from '@lp/sdk';
import { Plus, Wallet as WalletIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge, Card, Loader, PageHeader } from '@/components/dash/ui';
import {
  useCreateDepositRequest,
  useDepositRequests,
  useLedger,
  useWallet,
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

export default function WalletPage() {
  const wallet = useWallet();
  const ledger = useLedger(200);
  const deposits = useDepositRequests();
  const createDeposit = useCreateDepositRequest();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DepositMethod>('card');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const primary = wallet.data?.wallets[0];
  const balance = primary ? Number(primary.balance) : 0;
  const currency = primary?.currency ?? 'USD';
  const entries = ledger.data?.items ?? [];
  const requests = deposits.data?.items ?? [];

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

  return (
    <div>
      <PageHeader
        title="Wallet"
        subtitle="Balance, deposits and transaction history"
        actions={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Add Funds
          </button>
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

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Deposit requests</h3>
          <span className="text-xs text-zinc-500">{requests.length} requests</span>
        </div>
        {deposits.isLoading ? (
          <Loader label="Loading deposit requests…" />
        ) : requests.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No deposit requests yet. Use “Add Funds” to submit one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Note</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.requestId} className="border-t border-zinc-800">
                    <td className="whitespace-nowrap py-2 text-zinc-400">
                      {new Date(r.createdAt).toLocaleString()}
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
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Transaction history</h3>
          <span className="text-xs text-zinc-500">{entries.length} entries</span>
        </div>
        {ledger.isLoading ? (
          <Loader label="Loading transactions…" />
        ) : (
          <LedgerTable entries={entries} />
        )}
      </Card>
    </div>
  );
}
