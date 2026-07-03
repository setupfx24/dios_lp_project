'use client';

import { useState } from 'react';

import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';

export function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-red-950 via-zinc-950 to-black text-zinc-100">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-auto bg-gradient-to-br from-red-950 via-zinc-950 to-black p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
