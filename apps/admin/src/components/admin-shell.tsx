'use client';

import { BookOpen, LayoutDashboard, LineChart, LogOut, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { adminApi } from '@/lib/sdk';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/brokers', label: 'Brokers', icon: Users },
  { href: '/a-book-trades', label: 'A-Book Trades', icon: BookOpen },
  { href: '/instruments', label: 'Instruments', icon: LineChart },
  { href: '/deposits', label: 'Deposits', icon: Wallet },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await adminApi.logout();
    } catch {
      // Even if the API call fails, fall through to the login screen — the
      // server cookie is httpOnly so the only way back in is re-auth anyway.
    } finally {
      router.push('/login');
    }
  }
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-red-950 via-zinc-950 to-black">
      <aside className="flex w-60 shrink-0 flex-col border-r border-red-900/40 bg-gradient-to-b from-red-950/60 to-black/80 px-3 py-4">
        <div className="mb-4 flex items-center justify-center gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/swis_logo.png" alt="SwissCresta" className="h-8 w-8 rounded-md" />
          <span className="text-lg font-semibold text-zinc-200">Admin</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className={cn(
            'mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-60',
          )}
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? 'Logging out…' : 'Logout'}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
