'use client';

import { Download } from 'lucide-react';
import { useMemo } from 'react';

import { Money } from '@lp/utils/money';

import type { TradeRecordDto } from '@lp/sdk';

import { Button } from '@/components/ui/button';
import { formatDateTime, formatMoney } from '@/lib/format';

interface Props {
  trades: readonly TradeRecordDto[];
}

export function TradesTable({ trades }: Props) {
  const csv = useMemo(() => buildCsv(trades), [trades]);

  if (trades.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        No trades yet. They will appear here in real-time as they execute.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between p-3">
        <span className="text-sm text-muted-foreground">{trades.length} trades</span>
        <Button asChild size="sm" variant="outline">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
            download={`trades-${Date.now()}.csv`}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </a>
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/40">
            <tr className="text-left">
              <Th>Time</Th>
              <Th>Trade ID</Th>
              <Th>Symbol</Th>
              <Th>Side</Th>
              <Th className="text-right">Quantity</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Value</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.tradeId} className="border-b last:border-0 hover:bg-muted/30">
                <Td>{formatDateTime(t.executedAt)}</Td>
                <Td className="font-mono text-xs">{t.tradeId}</Td>
                <Td>{t.symbol}</Td>
                <Td>
                  <span className={t.side === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}>
                    {t.side}
                  </span>
                </Td>
                <Td className="text-right">{t.quantity}</Td>
                <Td className="text-right">{formatMoney(t.price)}</Td>
                <Td className="text-right font-medium">
                  {formatMoney(new Money(t.quantity).mul(t.price))}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium text-muted-foreground ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function buildCsv(rows: readonly TradeRecordDto[]): string {
  const header = ['executedAt', 'tradeId', 'orderId', 'symbol', 'side', 'quantity', 'price'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.executedAt, r.tradeId, r.orderId, r.symbol, r.side, r.quantity, r.price]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    );
  }
  return lines.join('\n');
}
