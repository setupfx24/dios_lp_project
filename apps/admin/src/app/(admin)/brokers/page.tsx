'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type CreateBrokerResult } from '@lp/sdk';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/sdk';

/**
 * Broker onboarding (bulk) + roster. Add one or more broker rows and create
 * them all at once. Each row is created independently via the audited
 * single-create endpoint, so a bad row (e.g. duplicate email) fails on its
 * own without blocking the others. Generated credentials are shown ONCE.
 */
type RowStatus = 'idle' | 'creating' | 'done' | 'error';

interface BrokerRow {
  id: number;
  displayName: string;
  contactEmail: string;
  initialBalance: string;
  currency: string;
  status: RowStatus;
  result?: CreateBrokerResult | undefined;
  error?: string | undefined;
}

let nextRowId = 1;
const blankRow = (): BrokerRow => ({
  id: nextRowId++,
  displayName: '',
  contactEmail: '',
  initialBalance: '5000',
  currency: 'USD',
  status: 'idle',
});

const rowValid = (r: BrokerRow): boolean =>
  r.displayName.trim().length >= 2 && r.contactEmail.includes('@');

export default function BrokersPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<BrokerRow[]>(() => [blankRow()]);
  const [busy, setBusy] = useState(false);

  const brokers = useQuery({ queryKey: ['brokers'], queryFn: () => adminApi.listBrokers() });

  const patchRow = (id: number, patch: Partial<BrokerRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (id: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  const pendingCount = rows.filter((r) => r.status !== 'done' && rowValid(r)).length;

  async function createAll() {
    setBusy(true);
    // Create sequentially for stable, ordered results.
    const toCreate = rows.filter((r) => r.status !== 'done' && rowValid(r));
    for (const r of toCreate) {
      patchRow(r.id, { status: 'creating', error: undefined });
      try {
        const res = await adminApi.createBroker({
          displayName: r.displayName.trim(),
          contactEmail: r.contactEmail.trim(),
          initialBalance: r.initialBalance.trim() || '5000',
          currency: r.currency.trim() || 'USD',
        });
        patchRow(r.id, { status: 'done', result: res });
      } catch (err) {
        patchRow(r.id, { status: 'error', error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ['brokers'] });
  }

  const created = rows.flatMap((r) => (r.status === 'done' && r.result ? [r.result] : []));

  function startNewBatch() {
    nextRowId = 1;
    setRows([blankRow()]);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary">Brokers</h1>

      {created.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">
              {created.length} broker{created.length > 1 ? 's' : ''} created — save these now (shown
              only once)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Passwords and API secrets are hashed at rest and cannot be retrieved again. Paste each
              into the matching dios broker&apos;s Swistrade Book Management settings.
            </p>
            {created.map((b) => (
              <CredentialBundle key={b.brokerId} bundle={b} />
            ))}
            <Button variant="outline" onClick={startNewBatch}>
              Done — start a new batch
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Onboard brokers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map((r, idx) => (
            <div key={r.id} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Broker {idx + 1}</span>
                <div className="flex items-center gap-2">
                  {r.status === 'done' && (
                    <span className="text-xs font-semibold text-emerald-500">✓ Created</span>
                  )}
                  {r.status === 'creating' && (
                    <span className="text-xs text-muted-foreground">Creating…</span>
                  )}
                  {r.status === 'error' && (
                    <span className="text-xs font-semibold text-destructive" title={r.error}>
                      ✕ {r.error}
                    </span>
                  )}
                  {rows.length > 1 && r.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      aria-label="Remove broker row"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Display name</Label>
                  <Input
                    value={r.displayName}
                    disabled={r.status === 'done' || busy}
                    onChange={(e) => patchRow(r.id, { displayName: e.target.value })}
                    placeholder="Acme Broker"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Contact / login email</Label>
                  <Input
                    type="email"
                    value={r.contactEmail}
                    disabled={r.status === 'done' || busy}
                    onChange={(e) => patchRow(r.id, { contactEmail: e.target.value })}
                    placeholder="ops@acme.example"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Opening balance</Label>
                  <Input
                    value={r.initialBalance}
                    disabled={r.status === 'done' || busy}
                    onChange={(e) => patchRow(r.id, { initialBalance: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Input
                    value={r.currency}
                    disabled={r.status === 'done' || busy}
                    onChange={(e) => patchRow(r.id, { currency: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={addRow} disabled={busy}>
              + Add another broker
            </Button>
            <Button onClick={() => void createAll()} disabled={busy || pendingCount === 0}>
              {busy
                ? 'Creating…'
                : `Create ${pendingCount > 0 ? pendingCount : ''} broker${pendingCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brokers</CardTitle>
        </CardHeader>
        <CardContent>
          {brokers.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {brokers.error && (
            <p className="text-sm text-destructive">
              {brokers.error instanceof Error ? brokers.error.message : 'Failed to load'}
            </p>
          )}
          {brokers.data && brokers.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No brokers yet.</p>
          )}
          {brokers.data && brokers.data.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Broker ID</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Contact</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {brokers.data.map((b) => (
                  <tr key={b.brokerId} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{b.brokerId}</td>
                    <td className="py-2">{b.displayName}</td>
                    <td className="py-2">{b.contactEmail}</td>
                    <td className="py-2">{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CredentialBundle({ bundle }: { bundle: CreateBrokerResult }) {
  const rows: [string, string][] = [
    ['Broker ID', bundle.brokerId],
    ['Login email', bundle.login.email],
    ['Login password', bundle.login.password],
    ['API key', bundle.apiKey.full],
    ['Wallet balance', `${bundle.wallet.balance} ${bundle.wallet.currency}`],
  ];
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="mb-2 text-sm font-semibold">{bundle.displayName}</p>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <code className="flex-1 truncate rounded bg-muted/60 px-2 py-1 text-xs">{value}</code>
            <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(value)}>
              Copy
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
