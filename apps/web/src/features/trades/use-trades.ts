'use client';

import { useQuery } from '@tanstack/react-query';

import { lp } from '@/lib/sdk';

export function useTrades(params: { brokerId?: string; symbol?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['trades', params],
    queryFn: () => lp.listTrades(params),
  });
}
