'use client';

import { Activity, ArrowUpRight, BarChart3, Layers, Receipt, Wallet } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { useTradeStats } from '@/features/dashboard/use-stats';
import { useTrades } from '@/features/trades/use-trades';
import { formatDateTime, formatMoney } from '@/lib/format';

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useTradeStats();
  const { data: trades, isLoading: tradesLoading } = useTrades({ limit: 5 });

  const totalTrades = stats?.totalTrades ?? 0;
  const turnover = stats?.totalTurnover ?? '0';
  const chargesTotal = stats?.chargesTotal ?? '0';
  const chargesCount = stats?.chargesCount ?? 0;
  const distinctSymbols = stats?.distinctSymbols ?? 0;
  const lastAt = stats?.lastExecutedAt ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your trades, turnover and charges.
          </p>
        </div>
        {lastAt ? (
          <p className="text-xs text-muted-foreground sm:text-sm">
            Last trade:{' '}
            <span className="font-medium text-foreground">{formatDateTime(lastAt)}</span>
          </p>
        ) : null}
      </header>

      {statsError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load stats: {statsError instanceof Error ? statsError.message : 'Unknown error'}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Trades"
          value={statsLoading ? '—' : totalTrades.toLocaleString('en-IN')}
          hint={
            distinctSymbols > 0
              ? `${distinctSymbols} symbol${distinctSymbols === 1 ? '' : 's'}`
              : 'no trades yet'
          }
          icon={Receipt}
          tone="info"
        />
        <StatCard
          label="Total Turnover"
          value={statsLoading ? '—' : formatMoney(turnover)}
          hint="₹ across all symbols"
          icon={BarChart3}
          tone="positive"
        />
        <StatCard
          label="Total Charges"
          value={statsLoading ? '—' : formatMoney(chargesTotal)}
          hint={`${chargesCount.toLocaleString('en-IN')} charge entries`}
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Avg Charge / Trade"
          value={
            statsLoading || totalTrades === 0
              ? '—'
              : formatMoney(String(Number(chargesTotal) / totalTrades || 0), 2)
          }
          hint="brokerage + taxes + fees"
          icon={Activity}
          tone="default"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Trades</CardTitle>
            <Link
              href="/trades"
              className="inline-flex items-center text-xs font-medium text-primary hover:underline sm:text-sm"
            >
              View all <ArrowUpRight className="ml-0.5 h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {tradesLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !trades || trades.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trades yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Symbol</th>
                      <th className="py-2 pr-3 font-medium">Side</th>
                      <th className="py-2 pr-3 text-right font-medium">Qty</th>
                      <th className="py-2 pr-3 text-right font-medium">Price</th>
                      <th className="py-2 pr-3 text-right font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.items.map((t) => (
                      <tr key={t.tradeId} className="border-t">
                        <td className="py-2 pr-3 font-medium">{t.symbol}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={
                              t.side === 'BUY'
                                ? 'inline-block rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'inline-block rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                            }
                          >
                            {t.side}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{t.quantity}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatMoney(t.price)}
                        </td>
                        <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
                          {formatDateTime(t.executedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Charge Breakdown</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading || !stats ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : stats.chargesByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">No charges yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {[...stats.chargesByType]
                  .sort((a, b) => Number(b.amount) - Number(a.amount))
                  .map((row) => {
                    const pct =
                      Number(stats.chargesTotal) === 0
                        ? 0
                        : (Number(row.amount) / Number(stats.chargesTotal)) * 100;
                    return (
                      <li key={row.type} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{prettyType(row.type)}</span>
                          <span className="tabular-nums">{formatMoney(row.amount)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
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
