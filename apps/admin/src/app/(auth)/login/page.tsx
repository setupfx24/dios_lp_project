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
        {/* Faded "liquidity network" illustration */}
        <svg
          className="admin-net absolute inset-0 h-full w-full"
          viewBox="0 0 1200 800"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <g stroke="#f87171" strokeOpacity="0.45" strokeWidth="1">
            <line x1="150" y1="190" x2="350" y2="120" />
            <line x1="350" y1="120" x2="540" y2="250" />
            <line x1="540" y1="250" x2="320" y2="410" />
            <line x1="320" y1="410" x2="150" y2="190" />
            <line x1="540" y1="250" x2="690" y2="160" />
            <line x1="690" y1="160" x2="850" y2="300" />
            <line x1="850" y1="300" x2="1000" y2="190" />
            <line x1="850" y1="300" x2="720" y2="470" />
            <line x1="720" y1="470" x2="500" y2="560" />
            <line x1="500" y1="560" x2="320" y2="410" />
            <line x1="720" y1="470" x2="930" y2="570" />
            <line x1="930" y1="570" x2="1080" y2="430" />
            <line x1="1080" y1="430" x2="1000" y2="190" />
            <line x1="500" y1="560" x2="220" y2="620" />
          </g>
          <g fill="#ef4444">
            {[
              [150, 190],
              [350, 120],
              [540, 250],
              [320, 410],
              [690, 160],
              [850, 300],
              [1000, 190],
              [720, 470],
              [500, 560],
              [930, 570],
              [1080, 430],
              [220, 620],
            ].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 5 : 3} className="admin-node" />
            ))}
          </g>
        </svg>
        <div className="admin-ring" style={{ animationDelay: '0s' }} />
        <div className="admin-ring" style={{ animationDelay: '1.3s' }} />
        <div className="admin-ring" style={{ animationDelay: '2.6s' }} />
        <div className="admin-ring" style={{ animationDelay: '3.9s' }} />
      </div>

      <div className="absolute left-8 top-7 z-10 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/swis_logo.png" alt="SwissCresta" className="h-10 w-10 rounded-lg" />
        <span className="text-lg font-semibold text-white">SwissCresta</span>
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/45 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/swis_logo.png" alt="SwissCresta" className="h-14 w-14 rounded-xl" />
          <span className="text-lg font-semibold text-white">SwissCresta</span>
        </div>
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
        @keyframes adminNetDrift { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
        @keyframes adminNode { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        .admin-net { opacity: 0.18; animation: adminNetDrift 16s ease-in-out infinite; }
        .admin-node { animation: adminNode 3.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .admin-grid, .admin-glow, .admin-ring, .admin-net, .admin-node { animation: none; }
          .admin-ring { display: none; }
        }
      `}</style>
    </main>
  );
}
