import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'LP Operator Console',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
       * suppressHydrationWarning on <body> too — browser extensions
       * (ColorZilla, Grammarly, Lazarus, etc.) mutate the body element
       * before React hydrates, causing harmless mismatch warnings.
       * The flag only suppresses warnings for THIS element's attributes,
       * not for any descendant or for actual content mismatches.
       */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
