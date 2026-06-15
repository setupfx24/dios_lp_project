'use client';

import {
  Activity,
  AlertOctagon,
  ClipboardList,
  Cog,
  FileSearch,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

const NAV = [
  { href: '/operations', label: 'Operations', icon: Cog },
  { href: '/positions', label: 'Live Positions', icon: Activity },
  { href: '/brokers', label: 'Brokers', icon: Users },
  { href: '/interventions', label: 'Interventions', icon: Wallet },
  { href: '/approvals', label: 'Approvals', icon: ClipboardList },
  { href: '/audit', label: 'Audit', icon: FileSearch },
  { href: '/users', label: 'Admin users', icon: ShieldAlert },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const env = process.env.NEXT_PUBLIC_ENV ?? 'DEV';
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r-4 border-primary/40 bg-card px-3 py-4">
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-primary/40 bg-card px-6">
          <div className="text-sm font-medium text-primary">
            Operator console — actions are immutable
          </div>
          <div
            className={cn(
              'rounded px-3 py-1 text-xs font-bold uppercase',
              env === 'PROD'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary/20 text-primary',
            )}
          >
            {env}
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
