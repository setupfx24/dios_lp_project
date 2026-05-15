'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/sdk';

export default function RecoveryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.useRecoveryCode(code.trim());
      router.push('/operations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid recovery code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Recovery code</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Each code is single-use. After login, set up 2FA again on a fresh device and copy a new
            set of codes.
          </p>
          <form
            className="space-y-4"
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={onSubmit}
          >
            <div className="space-y-2">
              <Label htmlFor="code">Recovery code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || code.length < 8} className="w-full">
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
