'use client';

import { useQuery } from '@tanstack/react-query';

import { lp } from '@/lib/sdk';

export function useTradeStats() {
  return useQuery({
    queryKey: ['trade-stats'],
    queryFn: () => lp.tradeStats(),
    refetchInterval: 15_000,
  });
}
