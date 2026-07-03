'use client';

import { Menu, Wifi } from 'lucide-react';

import { useMe } from '@/features/account/hooks';

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { data } = useMe();
  const name = data?.broker.displayName ?? data?.user?.email ?? 'Broker';

  return (
    <header className="flex h-16 items-center justify-between border-b border-red-900/30 bg-red-950/40 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="-ml-1 rounded-md p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="truncate text-sm text-zinc-400">
          Signed in as <span className="font-medium text-white">{name}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
          <Wifi className="h-3.5 w-3.5" /> Live
        </span>
      </div>
    </header>
  );
}
