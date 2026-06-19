'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { loginSchema, type LoginDto } from '@lp/validators';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { lp } from '@/lib/sdk';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginDto) {
    setBusy(true);
    setError(null);
    try {
      await lp.login(values);
      router.push('/trades');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-gradient-to-br from-red-950 via-zinc-950 to-black text-white">
      {/* Brand / illustration panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="pointer-events-none absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-red-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-red-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-sm font-bold text-white">
            LP
          </div>
          <span className="text-xl font-semibold">Broker Console</span>
        </div>

        <div className="relative flex flex-1 items-center justify-center">
          <Illustration />
        </div>

        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight">Liquidity, in real time.</h2>
          <p className="mt-3 max-w-md text-zinc-400">
            Monitor your A-Book flow, live positions and settlements — all in one console.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-xs font-bold text-white">
              LP
            </div>
            <span className="text-lg font-semibold">Broker Console</span>
          </div>

          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-zinc-400">Welcome back to the broker console.</p>

          <form
            className="space-y-4"
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" {...register('email')} />
              {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="text-sm text-red-400">{errors.password.message}</p>}
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
      </div>
    </main>
  );
}

/** Decorative finance chart (area + candlesticks) — no external asset. */
function Illustration() {
  return (
    <svg viewBox="0 0 420 260" className="h-64 w-full max-w-lg" fill="none">
      <defs>
        <linearGradient id="lpArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* subtle gridlines */}
      {[60, 110, 160, 210].map((y) => (
        <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="#ffffff" strokeOpacity="0.05" />
      ))}

      {/* area + trend line */}
      <path
        d="M0,190 C50,170 80,200 120,150 C160,100 200,135 240,95 C290,55 330,110 420,40 L420,260 L0,260 Z"
        fill="url(#lpArea)"
      />
      <path
        d="M0,190 C50,170 80,200 120,150 C160,100 200,135 240,95 C290,55 330,110 420,40"
        stroke="#ef4444"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="420" cy="40" r="5" fill="#ef4444" />

      {/* candlesticks */}
      {[
        { x: 60, t: 150, b: 215, ot: 165, ob: 200, up: false },
        { x: 130, t: 120, b: 195, ot: 135, ob: 175, up: true },
        { x: 200, t: 95, b: 170, ot: 110, ob: 150, up: true },
        { x: 270, t: 70, b: 150, ot: 85, ob: 125, up: false },
        { x: 340, t: 45, b: 130, ot: 60, ob: 105, up: true },
      ].map((c) => (
        <g key={c.x} stroke={c.up ? '#34d399' : '#f87171'} fill={c.up ? '#34d399' : '#f87171'}>
          <line x1={c.x} y1={c.t} x2={c.x} y2={c.b} strokeWidth="2" />
          <rect x={c.x - 6} y={c.ot} width="12" height={c.ob - c.ot} rx="1.5" opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}
