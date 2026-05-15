'use client';

import { LineChart, Receipt, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const NAV = [
  { href: '/trades', label: 'Trades', icon: Receipt },
  { href: '/positions', label: 'Positions', icon: LineChart },
  { href: '/charges', label: 'Charges', icon: Wallet },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-card px-3 py-4">
      <div className="mb-6 px-2 text-lg font-semibold">LP Dashboard</div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
