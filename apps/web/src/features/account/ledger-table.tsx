'use client';

import { ArrowDownRight, ArrowUpRight, Receipt } from 'lucide-react';

import type { LedgerEntryDto } from '@lp/sdk';

import { Badge, DataTable, EmptyState, Td, Th } from '@/components/dash/ui';
import { formatDateTime } from '@/lib/format';

const REF_COLOR: Record<string, 'green' | 'red' | 'blue' | 'yellow' | 'purple' | 'cyan' | 'zinc'> =
  {
    DEPOSIT: 'green',
    WITHDRAWAL: 'red',
    TRADE: 'blue',
    CHARGE: 'yellow',
    ADJUSTMENT: 'purple',
  };

export function LedgerTable({ entries }: { entries: readonly LedgerEntryDto[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No transactions yet"
        sub="Your transaction history will appear here."
      />
    );
  }
  return (
    <DataTable>
      <thead className="border-b border-zinc-800 bg-zinc-800/40">
        <tr>
          <Th>Type</Th>
          <Th className="text-right">Amount</Th>
          <Th>Reference</Th>
          <Th>Description</Th>
          <Th>Date</Th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const credit = e.direction === 'CREDIT';
          return (
            <tr key={e.entryId} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
              <Td>
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    credit ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {credit ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                  {e.direction}
                </span>
              </Td>
              <Td
                className={`text-right font-medium ${credit ? 'text-green-400' : 'text-red-400'}`}
              >
                {credit ? '+' : '-'}
                {e.amount} {e.currency}
              </Td>
              <Td>
                <Badge color={REF_COLOR[e.referenceType] ?? 'zinc'}>{e.referenceType}</Badge>
              </Td>
              <Td className="text-zinc-400">{e.description}</Td>
              <Td className="whitespace-nowrap text-zinc-400">{formatDateTime(e.createdAt)}</Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
