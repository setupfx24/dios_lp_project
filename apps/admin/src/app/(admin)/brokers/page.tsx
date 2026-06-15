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
 * Broker onboarding (single broker) + roster. This platform supports exactly
 * ONE broker: once a broker exists the onboarding form is replaced by a notice
 * and the backend rejects any further create. Generated credentials are shown
 * ONCE and cannot be retrieved again.
 */
export default function BrokersPage() {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [initialBalance, setInitialBalance] = useState('5000');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateBrokerResult | null>(null);

  const brokers = useQuery({ queryKey: ['brokers'], queryFn: () => adminApi.listBrokers() });

  const brokerExists = (brokers.data?.length ?? 0) > 0;
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
      void qc.invalidateQueries({ queryKey: ['brokers'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broker');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary">Brokers</h1>

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

      {/* Onboarding form — shown only while NO broker exists (one broker max). */}
      {!brokerExists && !created && (
        <Card>
          <CardHeader>
            <CardTitle>Onboard broker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This platform supports a single broker. Once created, no further brokers can be added.
            </p>
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
            <Button onClick={() => void createBroker()} disabled={busy || !formValid}>
              {busy ? 'Creating…' : 'Create broker'}
            </Button>
          </CardContent>
        </Card>
      )}

      {brokerExists && !created && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              A broker already exists. This platform supports only one broker, so onboarding is
              disabled.
            </p>
          </CardContent>
        </Card>
      )}

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
