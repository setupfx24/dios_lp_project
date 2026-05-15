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
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{brokerName}</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onClick={logout}
      >
        <LogOut className="mr-2 h-4 w-4" /> Logout
      </Button>
    </header>
  );
}
