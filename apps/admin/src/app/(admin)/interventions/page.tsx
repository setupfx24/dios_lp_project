'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/sdk';

/**
 * Wallet-adjust intervention. Below the configured threshold (₹10,000)
 * executes immediately. Above threshold the request lands on the
 * approvals queue. Either branch requires reauth + writes audit.
 */
export default function InterventionsPage() {
  const qc = useQueryClient();
  const [brokerId, setBrokerId] = useState('demo-broker-1');
  const [direction, setDirection] = useState<'DEBIT' | 'CREDIT'>('CREDIT');
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const reauth = useMutation({
    mutationFn: (pw: string) => adminApi.reauth(pw),
    onSuccess: (r) => setReauthToken(r.reauthToken),
  });

  const adjust = useMutation({
    mutationFn: () =>
      adminApi.withReauth(reauthToken ?? '').walletAdjust({ brokerId, direction, amount, reason }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Interventions</h1>

      {!reauthToken && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Re-authenticate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
            />
            <Button
              disabled={reauthPassword.length < 8 || reauth.isPending}
              onClick={() => reauth.mutate(reauthPassword)}
            >
              {reauth.isPending ? 'Verifying…' : 'Unlock interventions (5 min)'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Wallet adjust</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Broker ID</Label>
            <Input value={brokerId} onChange={(e) => setBrokerId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'DEBIT' | 'CREDIT')}
            >
              <option value="CREDIT">CREDIT</option>
              <option value="DEBIT">DEBIT</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Amount (INR)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Above ₹10,000 → routes to approvals queue (4-eyes).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason (mandatory, ≥ 10 chars)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button
            disabled={!reauthToken || reason.length < 10 || adjust.isPending}
            onClick={() => adjust.mutate()}
          >
            {adjust.isPending ? 'Submitting…' : 'Submit'}
          </Button>
          {adjust.error && (
            <p className="text-sm text-destructive">
              {adjust.error instanceof Error ? adjust.error.message : 'Failed'}
            </p>
          )}
          {result !== null && (
            <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
