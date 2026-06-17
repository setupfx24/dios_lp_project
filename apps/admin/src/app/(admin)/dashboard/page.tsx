'use client';

import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, Users, Wallet, type LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/sdk';

function usd(v: string | number): string {
  const n = Number(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const q = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => adminApi.dashboard() });
  const d = q.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Brokers" value={d ? String(d.brokersCount) : '…'} icon={Users} />
        <Stat label="Total Balance" value={d ? usd(d.totalBalance) : '…'} icon={Wallet} />
        <Stat label="Total PnL" value={d ? usd(d.totalPnl) : '…'} icon={TrendingUp} />
        <Stat label="Commission" value={d ? usd(d.totalCommission) : '…'} icon={DollarSign} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Brokers</CardTitle>
        </CardHeader>
        <CardContent>
          {!d ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : d.recentBrokers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No brokers yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {d.recentBrokers.map((b) => (
                <div key={b.brokerId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-foreground">{b.displayName}</p>
                    <p className="text-xs text-muted-foreground">{b.contactEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{usd(b.balance)}</p>
                    <span className="text-xs text-emerald-500">{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        </div>
        <Icon className="h-6 w-6 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
