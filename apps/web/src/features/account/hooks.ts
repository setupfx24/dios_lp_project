'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DepositMethod } from '@lp/sdk';

import { lp } from '@/lib/sdk';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => lp.getMe(), retry: false });
}

export function useWallet() {
  return useQuery({ queryKey: ['wallet'], queryFn: () => lp.getWallet() });
}

export function useLedger(limit = 100) {
  return useQuery({ queryKey: ['ledger', limit], queryFn: () => lp.listLedger(limit) });
}

export function useOrders(query: { status?: string; limit?: number } = {}) {
  return useQuery({ queryKey: ['orders', query], queryFn: () => lp.listOrders(query) });
}

export function useDepositRequests() {
  return useQuery({
    queryKey: ['deposit-requests'],
    queryFn: () => lp.listDepositRequests(),
  });
}

export function useCommissions() {
  return useQuery({ queryKey: ['commissions'], queryFn: () => lp.listCommissions() });
}

export function useCreateDepositRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: string; method: DepositMethod; reference?: string; note?: string }) =>
      lp.createDepositRequest(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deposit-requests'] });
    },
  });
}
