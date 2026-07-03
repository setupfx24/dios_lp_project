'use client';

import {
  Activity,
  ArrowLeftRight,
  LayoutDashboard,
  LogOut,
  Percent,
  Receipt,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { lp } from '@/lib/sdk';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/trades', label: 'Trades', icon: Receipt },
  { href: '/positions', label: 'Positions', icon: Activity },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/charges', label: 'Commissions', icon: Percent },
];

export function Sidebar() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  function logout() {
    setLoggingOut(true);
    // Always land on /login even if the API call fails, with a full reload so
    // all in-memory auth state is dropped and the cleared cookie re-evaluated.
    void lp
      .logout()
      .catch(() => {})
      .finally(() => {
        window.location.href = '/login';
      });
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-red-900/30 bg-gradient-to-b from-red-950/60 to-black/80 px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/swis_logo.png" alt="SwissCresta" className="h-8 w-8 shrink-0 rounded-md" />
        <span className="whitespace-nowrap text-base font-semibold text-white">
          SwissCresta
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className="mt-auto flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {loggingOut ? 'Logging out…' : 'Logout'}
      </button>
    </aside>
  );
}
