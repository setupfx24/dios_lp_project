'use client';

import { ArrowLeftRight, LayoutDashboard, Receipt, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/trades', label: 'Trades', icon: Receipt },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
          LP
        </div>
        <span className="text-lg font-semibold text-white">Broker Console</span>
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
    </aside>
  );
}
