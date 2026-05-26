'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { SdkError } from '@lp/sdk';

import { ReauthProvider } from './reauth-provider';

/**
 * Auth lifecycle: when ANY query or mutation reports a session-expired error
 * (401 with AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID), wipe the admin cookie
 * and bounce to /login. Avoids the user seeing "Admin token invalid" red
 * banners on every refetch after their JWT expires.
 */
function handleAuthError(err: unknown): void {
  if (!SdkError.isTokenExpired(err)) return;
  if (typeof window === 'undefined') return;
  // Cookie was set with Path=/ on the API origin (localhost:3000). The same
  // browser sees the admin app on a different port (localhost:3002); we can't
  // delete the API-origin cookie from here, but the API's response carries
  // no Set-Cookie clear, so the cookie remains until the user logs out or it
  // is overwritten by next login. Either way, redirecting to /login forces
  // the login form to re-issue a fresh cookie.
  const loginUrl = '/login?reason=expired';
  if (window.location.pathname !== '/login') {
    window.location.href = loginUrl;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, err) => {
              // Don't retry auth failures — they need a fresh login, not a retry.
              if (SdkError.isTokenExpired(err) || SdkError.isReauthRequired(err)) return false;
              return failureCount < 1;
            },
          },
        },
        queryCache: new QueryCache({ onError: handleAuthError }),
        mutationCache: new MutationCache({ onError: handleAuthError }),
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ReauthProvider>{children}</ReauthProvider>
    </QueryClientProvider>
  );
}
