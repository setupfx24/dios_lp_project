'use client';

import { AlertTriangle, ShieldOff, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBrokerDependents, useDeleteBroker } from '@/features/brokers/use-brokers';

interface Props {
  brokerId: string;
  brokerName: string;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Hard-delete confirmation modal.
 *
 * Three guardrails:
 *   1. **Preflight** — fetches `/dependents` and shows the count of orders /
 *      trades / api keys / users that reference this broker. If ANY are > 0,
 *      the destructive button is disabled and we direct the operator to
 *      "Suspend" instead.
 *   2. **Type-to-confirm** — operator must type the broker's exact ID to
 *      enable the button (defends against muscle-memory click-through).
 *   3. **Server re-checks** — the API runs the same count inside the audit
 *      transaction, so a concurrent INSERT cannot let a "safe" delete
 *      proceed against a broker that just gained a row.
 */
export function DeleteBrokerModal({ brokerId, brokerName, onClose, onDeleted }: Props) {
  const dependents = useBrokerDependents(brokerId);
  const del = useDeleteBroker();

  const [confirmText, setConfirmText] = useState('');
  const matches = confirmText.trim() === brokerId;

  const d = dependents.data;
  const totalDeps = d ? d.orders + d.trades + d.apiKeys + d.users : 0;
  const blocked = totalDeps > 0;

  async function handleDelete() {
    try {
      await del.mutateAsync(brokerId);
      onDeleted();
    } catch {
      // surfaced via del.error below
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-broker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-destructive/40 bg-card text-card-foreground shadow-xl">
        <div className="flex items-center justify-between border-b border-destructive/30 bg-destructive/5 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-destructive" />
            <h2 id="delete-broker-title" className="text-base font-semibold text-destructive">
              Delete broker permanently
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-accent"
            disabled={del.isPending}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">This is permanent and irreversible.</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The broker record is wiped from the database. Audit history of{' '}
                <em>this delete action</em> is preserved, but the broker row itself cannot be
                restored.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm">
              You are about to delete{' '}
              <span className="font-semibold text-foreground">{brokerName}</span> (
              <code className="font-mono text-xs">{brokerId}</code>).
            </p>
          </div>

          {dependents.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking dependent records…</p>
          ) : dependents.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              Failed to load dependents:{' '}
              {dependents.error instanceof Error ? dependents.error.message : 'Unknown error'}
            </p>
          ) : d ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dependent records
              </p>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <DepRow label="Orders" value={d.orders} />
                <DepRow label="Trades" value={d.trades} />
                <DepRow label="API keys" value={d.apiKeys} />
                <DepRow label="Dashboard users" value={d.users} />
              </dl>
            </div>
          ) : null}

          {blocked ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-semibold">Cannot delete — broker has history.</p>
              <p className="mt-0.5 text-xs">
                Brokers with orders, trades, API keys, or users cannot be deleted (audit /
                compliance). Use <strong>Suspend</strong> on the broker page instead — it freezes
                all activity but preserves the audit trail.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-id">
                  Type the broker ID to confirm:{' '}
                  <code className="font-mono text-xs">{brokerId}</code>
                </Label>
                <Input
                  id="confirm-id"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={brokerId}
                  autoFocus
                  disabled={del.isPending}
                />
              </div>
              {del.error ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                  {del.error instanceof Error ? del.error.message : 'Delete failed'}
                </p>
              ) : null}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleDelete();
              }}
              disabled={blocked || !matches || del.isPending || dependents.isLoading}
            >
              {del.isPending ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DepRow({ label, value }: { label: string; value: number }) {
  const zero = value === 0;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          zero
            ? 'tabular-nums text-emerald-700 dark:text-emerald-400'
            : 'tabular-nums text-amber-700 dark:text-amber-400'
        }
      >
        {value.toLocaleString('en-IN')}
      </dd>
    </>
  );
}
