import { AdminClient } from '@lp/sdk';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Module-level mutable reauth token. The reauth flow obtains a short-lived
 * token from `/api/v1/admin/auth/reauth` and presents it as `X-Reauth-Token`
 * on the next sensitive call. The token's TTL is enforced server-side
 * (default 300s) so we don't try to track expiry here — we just discard on
 * 403/logout.
 *
 * Keep this out of React state so it's accessible to any non-React caller
 * (e.g. background jobs / hooks created before the provider mounts).
 */
let reauthToken: string | undefined;

export function setReauthToken(token: string | undefined): void {
  reauthToken = token;
}

export function getReauthToken(): string | undefined {
  return reauthToken;
}

/**
 * Returns an AdminClient configured with the current reauth token (if any).
 * Use this for *every* mutation — the underlying client is cheap to build
 * (no network calls in the constructor) and we always want the freshest
 * token, even if the user just clicked through the reauth modal.
 */
export function getAdminClient(): AdminClient {
  return new AdminClient({ baseUrl, ...(reauthToken ? { reauthToken } : {}) });
}

/**
 * Singleton used for non-sensitive reads (broker list, audit log, etc.) that
 * never need a reauth token. Kept for backward compat with existing imports.
 */
export const adminApi = new AdminClient({ baseUrl });
