'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/sdk';

function usd(v: string | number): string {
  const n = Number(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const METHOD_LABEL: Record<string, string> = {
  card: 'Card',
  bank: 'Bank Transfer',
  upi: 'UPI',
  crypto: 'Crypto',
  manual: 'Manual',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'text-amber-400',
  APPROVED: 'text-emerald-400',
  REJECTED: 'text-red-400',
};

export default function DepositsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all');
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['admin-deposits', status],
    queryFn: () => adminApi.listDepositRequests(status === 'all' ? undefined : status),
  });

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approveDeposit(id),
    onMutate: (id) => {
      setActingId(id);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Approve failed'),
    onSettled: () => {
      setActingId(null);
      void qc.invalidateQueries({ queryKey: ['admin-deposits'] });
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) => adminApi.rejectDeposit(id),
    onMutate: (id) => {
      setActingId(id);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Reject failed'),
    onSettled: () => {
      setActingId(null);
      void qc.invalidateQueries({ queryKey: ['admin-deposits'] });
    },
  });

  const items = q.data?.items ?? [];
  const pending = items.filter((d) => d.status === 'PENDING');
  const pendingTotal = pending.reduce((s, d) => s + Number(d.amount), 0);
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary">Deposits</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Showing" value={String(items.length)} />
        <Stat label="Pending" value={String(pending.length)} />
        <Stat label="Pending Amount" value={usd(pendingTotal)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deposit requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-3">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as 'all' | 'PENDING' | 'APPROVED' | 'REJECTED')
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deposit requests in this view.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Broker</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Note</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.requestId} className="border-t border-border">
                    <td className="whitespace-nowrap py-2 text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2">{d.broker}</td>
                    <td
                      className={`py-2 font-medium ${d.kind === 'withdrawal' ? 'text-amber-400' : 'text-emerald-400'}`}
                    >
                      {d.kind === 'withdrawal' ? 'Withdrawal' : 'Deposit'}
                    </td>
                    <td className="py-2">{METHOD_LABEL[d.method] ?? d.method}</td>
                    <td className="py-2 text-right font-medium text-foreground">
                      {usd(d.amount)} <span className="text-muted-foreground">{d.currency}</span>
                    </td>
                    <td className="py-2 text-muted-foreground">{d.note ?? '—'}</td>
                    <td className={`py-2 font-medium ${STATUS_STYLE[d.status] ?? ''}`}>
                      {d.status}
                    </td>
                    <td className="py-2 text-right">
                      {d.status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => approve.mutate(d.requestId)}
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {actingId === d.requestId && approve.isPending ? 'Approving…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => reject.mutate(d.requestId)}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {actingId === d.requestId && reject.isPending ? 'Rejecting…' : 'Reject'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {d.decidedBy ? `by ${d.decidedBy}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
