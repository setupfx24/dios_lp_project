'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { lp } from '@/lib/sdk';

export function Header({ brokerName }: { brokerName: string }) {
  const router = useRouter();
  async function logout() {
    await lp.logout();
    router.push('/login');
  }
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 sm:px-6">
      <div className="min-w-0 truncate text-sm text-muted-foreground">
        <span className="hidden sm:inline">Signed in as </span>
        <span className="font-medium text-foreground">{brokerName}</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onClick={logout}
      >
        <LogOut className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Logout</span>
      </Button>
    </header>
  );
}
