'use client';

import {
  AlertOctagon,
  ClipboardList,
  Cog,
  FileSearch,
  LogOut,
  Menu,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { adminApi, setReauthToken } from '@/lib/sdk';

const NAV = [
  { href: '/operations', label: 'Operations', icon: Cog },
  { href: '/brokers', label: 'Brokers', icon: Users },
  { href: '/interventions', label: 'Interventions', icon: Wallet },
  { href: '/approvals', label: 'Approvals', icon: ClipboardList },
  { href: '/audit', label: 'Audit', icon: FileSearch },
  { href: '/users', label: 'Admin users', icon: ShieldAlert },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const env = process.env.NEXT_PUBLIC_ENV ?? 'DEV';
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer on route change so the user lands on the new page
  // without a stale overlay hanging open.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await adminApi.logout().catch(() => null);
    } finally {
      setReauthToken(undefined);
      window.location.href = '/login';
    }
  }

  const sidebarContent = (
    <>
      <div className="mb-2 flex items-center gap-2 px-2">
        <AlertOctagon className="h-5 w-5 text-primary" />
        <span className="text-lg font-semibold text-primary">LP Operator</span>
      </div>
      <p className="mb-4 px-2 text-xs uppercase tracking-wide text-destructive">
        Admin surface — every action audited
      </p>
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

      <div className="mt-auto border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-rose-700 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Desktop sidebar — hidden below lg */}
      <aside className="hidden w-60 shrink-0 flex-col border-r-4 border-primary/40 bg-card px-3 py-4 lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile drawer + backdrop */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r-4 border-primary/40 bg-card px-3 py-4 shadow-xl">
            <div className="mb-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-primary/40 bg-card px-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-1.5 hover:bg-accent lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate text-sm font-medium text-primary">
              <span className="hidden sm:inline">Operator console — actions are immutable</span>
              <span className="sm:hidden">LP Operator</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={cn(
                'rounded px-2 py-1 text-xs font-bold uppercase sm:px-3',
                env === 'PROD'
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-primary/20 text-primary',
              )}
            >
              {env}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-label="Sign out"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{loggingOut ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-muted/20 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
