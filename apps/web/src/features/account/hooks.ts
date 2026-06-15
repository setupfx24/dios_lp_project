'use client';

import { useQuery } from '@tanstack/react-query';

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
