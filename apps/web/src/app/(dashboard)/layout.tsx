import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-red-950 via-zinc-950 to-black text-zinc-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto bg-gradient-to-br from-red-950 via-zinc-950 to-black p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
