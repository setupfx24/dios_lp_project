'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { SdkError } from '@lp/sdk';

import { useReauth } from '@/components/reauth-provider';
import { adminApi, getAdminClient } from '@/lib/sdk';

const BROKERS_KEY = ['admin', 'brokers'] as const;
const apiKeysKey = (brokerId: string) => ['admin', 'brokers', brokerId, 'api-keys'] as const;
const brokerKey = (brokerId: string) => ['admin', 'brokers', brokerId] as const;

/**
 * Wrap a single API call so that a 403 "reauth required" automatically opens
 * the password modal and (on success) retries the call exactly once. The
 * second attempt uses `getAdminClient()` which picks up the fresh reauth
 * token that the modal just stored in the module-level singleton.
 */
function useWithReauth() {
  const { requestReauth } = useReauth();
  return async function withReauth<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!SdkError.isReauthRequired(err)) {
        throw err;
      }
      const ok = await requestReauth();
      if (!ok) {
        throw err;
      }
      // Retry exactly once. If the second call also asks for reauth, surface
      // the error so the user sees the wrong-password / invalid-token state.
      return await fn();
    }
  };
}

// ───────────────── Reads (no reauth needed) ─────────────────

export function useBrokers() {
  return useQuery({
    queryKey: BROKERS_KEY,
    queryFn: () => adminApi.listBrokers(),
  });
}

export function useBroker(brokerId: string) {
  return useQuery({
    queryKey: brokerKey(brokerId),
    queryFn: () => adminApi.brokerDetail(brokerId),
    enabled: Boolean(brokerId),
  });
}

export function useApiKeys(brokerId: string) {
  return useQuery({
    queryKey: apiKeysKey(brokerId),
    queryFn: () => adminApi.listApiKeys(brokerId),
    enabled: Boolean(brokerId),
  });
}

// ───────────────── Dependents preflight ─────────────────

export function useBrokerDependents(brokerId: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'brokers', brokerId, 'dependents'] as const,
    queryFn: () => adminApi.brokerDependents(brokerId),
    enabled: Boolean(brokerId) && enabled,
  });
}

// ───────────────── Mutations (reauth-gated server-side) ─────────────────

export function useCreateBroker() {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (input: { brokerId: string; displayName: string; contactEmail: string }) =>
      withReauth(() => getAdminClient().createBroker(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BROKERS_KEY });
    },
  });
}

export function useSuspendBroker() {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (brokerId: string) => withReauth(() => getAdminClient().suspendBroker(brokerId)),
    onSuccess: (_data, brokerId) => {
      void qc.invalidateQueries({ queryKey: BROKERS_KEY });
      void qc.invalidateQueries({ queryKey: brokerKey(brokerId) });
    },
  });
}

export function useReactivateBroker() {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (brokerId: string) => withReauth(() => getAdminClient().reactivateBroker(brokerId)),
    onSuccess: (_data, brokerId) => {
      void qc.invalidateQueries({ queryKey: BROKERS_KEY });
      void qc.invalidateQueries({ queryKey: brokerKey(brokerId) });
    },
  });
}

/**
 * Hard delete a broker. Refused server-side if any orders / trades / api
 * keys / users reference it. UI must preflight with `useBrokerDependents`
 * and disable the delete action when any dependent count > 0.
 *
 * Caller is responsible for navigating away from the now-deleted broker's
 * detail page; this hook only invalidates the brokers list cache.
 */
export function useDeleteBroker() {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (brokerId: string) => withReauth(() => getAdminClient().deleteBroker(brokerId)),
    onSuccess: (_data, brokerId) => {
      void qc.invalidateQueries({ queryKey: BROKERS_KEY });
      qc.removeQueries({ queryKey: brokerKey(brokerId) });
    },
  });
}

export function useIssueApiKey(brokerId: string) {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (input: { label: string; ipAllowlist?: string[] }) =>
      withReauth(() => getAdminClient().issueApiKey(brokerId, input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: apiKeysKey(brokerId) });
    },
  });
}

export function useRevokeApiKey(brokerId: string) {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (apiKeyId: string) =>
      withReauth(() => getAdminClient().revokeApiKey(brokerId, apiKeyId)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: apiKeysKey(brokerId) });
    },
  });
}

// ───────────────── Broker dashboard users ─────────────────

const brokerUsersKey = (brokerId: string) => ['admin', 'brokers', brokerId, 'users'] as const;

export function useBrokerUsers(brokerId: string) {
  return useQuery({
    queryKey: brokerUsersKey(brokerId),
    queryFn: () => adminApi.listBrokerUsers(brokerId),
    enabled: Boolean(brokerId),
  });
}

export function useCreateBrokerUser(brokerId: string) {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (input: { email: string; displayName: string; temporaryPassword?: string }) =>
      withReauth(() => getAdminClient().createBrokerUser(brokerId, input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: brokerUsersKey(brokerId) });
    },
  });
}

export function useSuspendBrokerUser(brokerId: string) {
  const qc = useQueryClient();
  const withReauth = useWithReauth();
  return useMutation({
    mutationFn: (userId: string) =>
      withReauth(() => getAdminClient().suspendBrokerUser(brokerId, userId)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: brokerUsersKey(brokerId) });
    },
  });
}
