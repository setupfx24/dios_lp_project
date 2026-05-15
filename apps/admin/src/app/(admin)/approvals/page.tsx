'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/sdk';

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => adminApi.listPendingApprovals(),
  });

  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthToken, setReauthToken] = useState<string | null>(null);

  const reauth = useMutation({
    mutationFn: (pw: string) => adminApi.reauth(pw),
    onSuccess: (r) => setReauthToken(r.reauthToken),
  });

  const approve = useMutation({
    mutationFn: (actionId: string) => adminApi.withReauth(reauthToken ?? '').approve(actionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Approvals</h1>
      <p className="text-sm text-muted-foreground">
        Pending 4-eyes actions. You cannot approve a request you filed.
      </p>

      {!reauthToken && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Re-authenticate to act</CardTitle>
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
              {reauth.isPending ? 'Verifying…' : 'Unlock approvals (5 min)'}
            </Button>
            {reauth.error && (
              <p className="text-sm text-destructive">
                {reauth.error instanceof Error ? reauth.error.message : 'Reauth failed'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load: {error instanceof Error ? error.message : 'unknown'}
        </p>
      )}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">No pending actions.</p>
      )}
      {data?.map((row) => {
        const r: Record<string, unknown> = row;
        const actionId = String(r.actionId ?? '');
        return (
          <Card key={actionId}>
            <CardHeader>
              <CardTitle>{String(r.actionType ?? '')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Requested by:</span>{' '}
                <span className="font-mono">{String(r.requestedBy ?? '')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Reason:</span> {String(r.reason ?? '')}
              </div>
              <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-xs">
                {JSON.stringify(r.payload, null, 2)}
              </pre>
              <Button
                disabled={!reauthToken || approve.isPending}
                onClick={() => approve.mutate(actionId)}
              >
                Approve
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
