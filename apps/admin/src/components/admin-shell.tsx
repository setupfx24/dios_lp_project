'use client';

import { BookOpen, LayoutDashboard, LineChart, LogOut, Menu, Users, Wallet } from 'lucide-react';
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
  const [menuOpen, setMenuOpen] = useState(false);

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
      {/* Mobile backdrop */}
      {menuOpen && (
        <div
          aria-hidden
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-64 max-w-[80vw] shrink-0 flex-col border-r border-red-900/40 bg-gradient-to-b from-red-950 to-black px-3 py-4 transition-transform duration-200 md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 md:from-red-950/60 md:to-black/80',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-center gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/swis_logo.png" alt="SwissCresta" className="h-8 w-8 rounded-md" />
          <span className="text-lg font-semibold text-zinc-200">SwissCresta</span>
          <span className="rounded-full bg-gradient-to-r from-green-400 to-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
            Admin
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
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
        {/* Mobile top bar with hamburger */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-red-900/40 px-4 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-md p-2 text-zinc-300 hover:bg-accent hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-zinc-200">SwissCresta Admin</span>
        </div>
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
