'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/sdk';

interface SetupState {
  qrDataUrl: string;
  secret: string;
}

export default function TwoFactorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <TwoFactorInner />
    </Suspense>
  );
}

function TwoFactorInner() {
  const router = useRouter();
  const params = useSearchParams();
  const isSetup = params.get('setup') === '1';

  const [setup, setSetup] = useState<SetupState | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSetup || setup) {
      return;
    }
    void (async () => {
      try {
        const r = await adminApi.beginTotpSetup();
        setSetup({ qrDataUrl: r.qrDataUrl, secret: r.secret });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Setup failed');
      }
    })();
  }, [isSetup, setup]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSetup) {
        const r = await adminApi.finalizeTotpSetup(code);
        setRecoveryCodes(r.recoveryCodes);
      } else {
        await adminApi.verifyTotp(code);
        router.push('/operations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-2xl border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              Save your recovery codes — shown ONCE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Each code is single-use. Use them only if you lose access to your authenticator app.
              Store offline (password manager / printed in a safe).
            </p>
            <ul className="grid grid-cols-2 gap-2 rounded border bg-muted/40 p-4 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button onClick={() => router.push('/operations')} className="w-full">
              I have saved them — continue
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/30">
        <CardHeader>
          <CardTitle className="text-primary">
            {isSetup ? 'Set up 2FA' : 'Two-factor verification'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isSetup && setup && (
            <div className="space-y-3">
              <p className="text-sm">
                Scan with an authenticator app (Authy, 1Password, Google Authenticator):
              </p>
              <Image src={setup.qrDataUrl} alt="TOTP QR" width={200} height={200} unoptimized />
              <p className="text-xs text-muted-foreground">
                Or enter this secret manually: <code className="break-all">{setup.secret}</code>
              </p>
            </div>
          )}
          <form
            className="mt-4 space-y-4"
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={onSubmit}
          >
            <div className="space-y-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
              {busy ? 'Verifying…' : isSetup ? 'Verify and finish setup' : 'Verify'}
            </Button>
            {!isSetup && (
              <p className="text-center text-sm">
                <Link href="/recovery" className="text-primary hover:underline">
                  Use a recovery code instead
                </Link>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
