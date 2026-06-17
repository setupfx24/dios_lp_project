'use client';

import { Wifi } from 'lucide-react';

import { useMe } from '@/features/account/hooks';

export function Header() {
  const { data } = useMe();
  const name = data?.broker.displayName ?? data?.user?.email ?? 'Broker';

  return (
    <header className="flex h-16 items-center justify-between border-b border-red-900/30 bg-red-950/40 px-6">
      <div className="text-sm text-zinc-400">
        Signed in as <span className="font-medium text-white">{name}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
          <Wifi className="h-3.5 w-3.5" /> Live
        </span>
      </div>
    </header>
  );
}
