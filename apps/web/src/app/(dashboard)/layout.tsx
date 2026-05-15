import type { ReactNode } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header brokerName="Demo Broker" />
        <main className="flex-1 overflow-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
