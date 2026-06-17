'use client';

import { LogOut, Wifi } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMe } from '@/features/account/hooks';
import { lp } from '@/lib/sdk';

export function Header() {
  const { data } = useMe();
  const name = data?.broker.displayName ?? data?.user?.email ?? 'Broker';

  function logout() {
    // Always land on /login even if the API call fails, and force a full reload
    // (window.location, not router.push) so all in-memory auth state is dropped
    // and the now-cleared cookie is re-evaluated from scratch.
    void lp
      .logout()
      .catch(() => {})
      .finally(() => {
        window.location.href = '/login';
      });
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6">
      <div className="text-sm text-zinc-400">
        Signed in as <span className="font-medium text-white">{name}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
          <Wifi className="h-3.5 w-3.5" /> Live
        </span>
        <Button size="sm" variant="ghost" onClick={logout} className="text-zinc-300">
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    </header>
  );
}
