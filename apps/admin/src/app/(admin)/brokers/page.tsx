'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { type CreateBrokerResult } from '@lp/sdk';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/sdk';

/**
 * Broker onboarding + roster. Multiple brokers are supported: use "Create
 * Broker" to onboard as many as needed. Generated credentials are shown ONCE
 * and cannot be retrieved again.
 */
export default function BrokersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [initialBalance, setInitialBalance] = useState('5000');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateBrokerResult | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const brokers = useQuery({ queryKey: ['brokers'], queryFn: () => adminApi.listBrokers() });

  const formValid = displayName.trim().length >= 2 && contactEmail.includes('@');

  async function createBroker() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.createBroker({
        displayName: displayName.trim(),
        contactEmail: contactEmail.trim(),
        initialBalance: initialBalance.trim() || '5000',
        currency: currency.trim() || 'USD',
      });
      setCreated(res);
      setShowForm(false);
      setDisplayName('');
      setContactEmail('');
      setInitialBalance('5000');
      setCurrency('USD');
      void qc.invalidateQueries({ queryKey: ['brokers'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broker');
    } finally {
      setBusy(false);
    }
  }

  async function removeBroker(brokerId: string, name: string) {
    if (!window.confirm(`Delete broker "${name}"? It will be removed from the active list.`)) {
      return;
    }
    setDeletingId(brokerId);
    try {
      await adminApi.deleteBroker(brokerId);
      void qc.invalidateQueries({ queryKey: ['brokers'] });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete broker');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-primary">Brokers</h1>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Broker
        </Button>
      </div>

      {created && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">
              Broker created — save these now (shown only once)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Passwords and API secrets are hashed at rest and cannot be retrieved again. Paste each
              into the dios broker&apos;s Swistrade Book Management settings.
            </p>
            <CredentialBundle bundle={created} />
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Onboard broker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Display name</Label>
                <Input
                  value={displayName}
                  disabled={busy}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Acme Broker"
                />
              </div>
              <div className="space-y-1">
                <Label>Contact / login email</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  disabled={busy}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="ops@acme.example"
                />
              </div>
              <div className="space-y-1">
                <Label>Opening balance</Label>
                <Input
                  value={initialBalance}
                  disabled={busy}
                  onChange={(e) => setInitialBalance(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Input
                  value={currency}
                  disabled={busy}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={() => void createBroker()} disabled={busy || !formValid}>
                {busy ? 'Creating…' : 'Create broker'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Brokers ({brokers.data?.length ?? 0})</CardTitle>
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
                  <th className="py-2">Name</th>
                  <th className="py-2">Email</th>
                  <th className="py-2 text-right">Balance</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {brokers.data.map((b) => (
                  <tr key={b.brokerId} className="border-t border-border">
                    <td className="py-2">
                      <div className="font-medium text-foreground">{b.displayName}</div>
                      <div className="font-mono text-xs text-muted-foreground">{b.brokerId}</div>
                    </td>
                    <td className="py-2">{b.contactEmail}</td>
                    <td className="py-2 text-right">
                      $
                      {Number(b.balance ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2">
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                        {b.status}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        disabled={deletingId === b.brokerId}
                        onClick={() => void removeBroker(b.brokerId, b.displayName)}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      >
                        {deletingId === b.brokerId ? 'Deleting…' : 'Delete'}
                      </Button>
                    </td>
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
