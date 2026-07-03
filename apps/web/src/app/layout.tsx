import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Broker Dashboard',
  description: 'Live trades, positions, and itemized charges.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-black">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
