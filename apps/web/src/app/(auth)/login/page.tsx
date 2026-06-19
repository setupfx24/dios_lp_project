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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-red-950 via-zinc-950 to-black p-6 text-white">
      {/* Animated ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        <svg className="absolute inset-0 h-full w-full opacity-25" preserveAspectRatio="none" viewBox="0 0 1200 600" fill="none">
          <path
            className="login-line"
            d="M0,420 C150,380 250,460 400,330 C550,200 700,300 850,210 C1000,120 1100,250 1200,140"
            stroke="#ef4444"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            className="login-line login-line-2"
            d="M0,500 C160,470 260,520 420,420 C580,320 720,400 880,330 C1040,260 1120,360 1200,300"
            stroke="#f87171"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Brand */}
      <div className="absolute left-8 top-7 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-sm font-bold text-white">
          LP
        </div>
        <span className="text-xl font-semibold">Broker Console</span>
      </div>

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
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

      <style>{`
        @keyframes lpFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -30px) scale(1.12); }
        }
        @keyframes lpDash {
          to { stroke-dashoffset: -1600; }
        }
        .login-orb {
          position: absolute;
          border-radius: 9999px;
          filter: blur(90px);
          opacity: 0.45;
          animation: lpFloat 16s ease-in-out infinite;
        }
        .login-orb-1 { width: 460px; height: 460px; background: #dc2626; top: -120px; left: -80px; }
        .login-orb-2 { width: 380px; height: 380px; background: #7f1d1d; bottom: -120px; right: -60px; animation-duration: 20s; animation-direction: reverse; }
        .login-orb-3 { width: 320px; height: 320px; background: #ef4444; top: 45%; left: 55%; animation-duration: 24s; opacity: 0.3; }
        .login-line { stroke-dasharray: 1600; animation: lpDash 12s linear infinite; }
        .login-line-2 { animation-duration: 18s; opacity: 0.7; }
        @media (prefers-reduced-motion: reduce) {
          .login-orb, .login-line { animation: none; }
        }
      `}</style>
    </main>
  );
}
