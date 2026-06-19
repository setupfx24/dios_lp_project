'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/sdk';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const reason = params.get('reason');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.login(email, password);
      if (res.status === 'totp_setup_required') {
        router.push('/two-factor?setup=1');
      } else if (res.status === 'totp_required') {
        router.push('/two-factor');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-red-950 via-zinc-950 to-black p-4 text-white">
      {/* Operator-console animated background: panning grid + radar pulse rings */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="admin-grid" />
        <div className="admin-glow" />
        <div className="admin-ring" style={{ animationDelay: '0s' }} />
        <div className="admin-ring" style={{ animationDelay: '1.3s' }} />
        <div className="admin-ring" style={{ animationDelay: '2.6s' }} />
        <div className="admin-ring" style={{ animationDelay: '3.9s' }} />
      </div>

      <div className="absolute left-8 top-7 z-10 flex items-center gap-2">
        <span className="text-lg font-semibold text-primary">LP Admin</span>
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/45 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold">LP Admin Sign in</h1>
        {reason === 'idle' ? (
          <p className="mb-6 mt-1 text-sm text-amber-400">
            Signed out due to inactivity. Please log in again.
          </p>
        ) : (
          <p className="mb-6 mt-1 text-sm text-zinc-400">Operator console — every action audited.</p>
        )}

        <form
          className="space-y-4"
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={onSubmit}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-red-600 text-white hover:bg-red-700"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>

      <style>{`
        @keyframes adminGridPan { from { transform: translate(0, 0); } to { transform: translate(46px, 46px); } }
        @keyframes adminPing {
          0% { width: 80px; height: 80px; opacity: 0.55; }
          100% { width: 1100px; height: 1100px; opacity: 0; }
        }
        @keyframes adminGlow {
          0%, 100% { opacity: 0.35; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.15); }
        }
        .admin-grid {
          position: absolute; inset: -60%;
          background-image:
            linear-gradient(rgba(248,113,113,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(248,113,113,0.07) 1px, transparent 1px);
          background-size: 46px 46px;
          animation: adminGridPan 18s linear infinite;
          mask-image: radial-gradient(circle at center, #000 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(circle at center, #000 30%, transparent 75%);
        }
        .admin-glow {
          position: absolute; left: 50%; top: 50%;
          width: 520px; height: 520px; border-radius: 9999px;
          background: radial-gradient(circle, rgba(220,38,38,0.35), transparent 70%);
          filter: blur(40px);
          animation: adminGlow 8s ease-in-out infinite;
        }
        .admin-ring {
          position: absolute; left: 50%; top: 50%;
          border: 1px solid rgba(239,68,68,0.4);
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          animation: adminPing 5.2s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .admin-grid, .admin-glow, .admin-ring { animation: none; }
          .admin-ring { display: none; }
        }
      `}</style>
    </main>
  );
}
