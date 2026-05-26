'use client';

import { Receipt, ShieldCheck, Wallet, Wallet2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { useTradeStats } from '@/features/dashboard/use-stats';
import { formatMoney } from '@/lib/format';

export default function ChargesPage() {
  const { data: stats, isLoading, error } = useTradeStats();

  const totalCharges = stats?.chargesTotal ?? '0';
  const chargesCount = stats?.chargesCount ?? 0;
  const totalTurnover = stats?.totalTurnover ?? '0';
  const totalTrades = stats?.totalTrades ?? 0;
  const effectivePct =
    stats && Number(totalTurnover) > 0
      ? ((Number(totalCharges) / Number(totalTurnover)) * 100).toFixed(4)
      : '0.0000';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Charges</h1>
        <p className="text-sm text-muted-foreground">
          Aggregate brokerage, taxes and exchange fees across all trades.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Charges"
          value={isLoading ? '—' : formatMoney(totalCharges)}
          hint={`${chargesCount.toLocaleString('en-IN')} entries`}
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Turnover"
          value={isLoading ? '—' : formatMoney(totalTurnover)}
          hint="₹ across all trades"
          icon={Wallet2}
          tone="positive"
        />
        <StatCard
          label="Effective Rate"
          value={isLoading ? '—' : `${effectivePct}%`}
          hint="charges / turnover"
          icon={ShieldCheck}
          tone="info"
        />
        <StatCard
          label="Avg / Trade"
          value={
            isLoading || totalTrades === 0
              ? '—'
              : formatMoney(String(Number(totalCharges) / totalTrades || 0))
          }
          hint={`across ${totalTrades.toLocaleString('en-IN')} trades`}
          icon={Receipt}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Charge Breakdown by Type</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !stats || stats.chargesByType.length === 0 ? (
            <p className="text-sm text-muted-foreground">No charges yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 text-right font-medium">Count</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 pr-3 text-right font-medium">% of total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats.chargesByType]
                    .sort((a, b) => Number(b.amount) - Number(a.amount))
                    .map((row) => {
                      const pct =
                        Number(stats.chargesTotal) === 0
                          ? 0
                          : (Number(row.amount) / Number(stats.chargesTotal)) * 100;
                      return (
                        <tr key={row.type} className="border-t">
                          <td className="py-2 pr-3 font-medium">{prettyType(row.type)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {row.count.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatMoney(row.amount)}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {pct.toFixed(2)}%
                              </span>
                              <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:inline-block">
                                <span
                                  className="block h-full rounded-full bg-primary/70"
                                  style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                                />
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Charges shown are aggregate. Drill down to a specific trade for the per-trade itemised
            breakdown.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function prettyType(type: string): string {
  switch (type) {
    case 'BROKERAGE':
      return 'Brokerage';
    case 'STT':
      return 'STT';
    case 'EXCHANGE_FEE':
      return 'Exchange Fee';
    case 'GST':
      return 'GST';
    case 'STAMP_DUTY':
      return 'Stamp Duty';
    case 'SEBI_FEE':
      return 'SEBI Fee';
    case 'TRANSACTION_FEE':
      return 'Transaction Fee';
    default:
      return type;
  }
}
