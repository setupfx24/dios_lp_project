'use client';

import {
  Activity,
  BarChart3,
  DollarSign,
  Gauge,
  ListChecks,
  Lock,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react';

import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Loader,
  PageHeader,
  StatCard,
  Td,
  Th,
} from '@/components/dash/ui';
import { useDashboard, useMe, useOrders } from '@/features/account/hooks';
import { useTrades } from '@/features/trades/use-trades';
import { formatDateTime } from '@/lib/format';

function usd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DashboardPage() {
  const me = useMe();
  const dash = useDashboard();
  const trades = useTrades({ limit: 200 });
  const orders = useOrders({ limit: 200 });

  const items = trades.data?.items ?? [];
  const orderItems = orders.data?.items ?? [];
  const totalVolume = items.reduce((s, t) => s + Number(t.quantity), 0);
  const openOrders = orderItems.filter(
    (o) => o.status === 'PENDING' || o.status === 'ACCEPTED',
  ).length;
  const recent = items.slice(0, 10);

  const d = dash.data;
  const n = (v?: string) => Number(v ?? '0');
  const equity = n(d?.totalEquity);
  const charges = n(d?.totalCharges);
  const rawPnl = n(d?.rawPnl);
  const netPnl = n(d?.netPnl);
  const floating = n(d?.floatingPnl);
  const freeMargin = n(d?.freeMargin);
  const locked = n(d?.lockedCapital);
  const balance = n(d?.balance);
  const profit = n(d?.profitWallet);
  const withdrawable = n(d?.withdrawable);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={me.data ? `Welcome back, ${me.data.broker.displayName}` : undefined}
      />

      <Card className="mb-6">
        {/* Equity + P&L row */}
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
              <WalletIcon className="text-green-500" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Total Equity</p>
              <p className="text-4xl font-bold text-white">{usd(equity)}</p>
              <p className="text-xs text-zinc-500">{d?.currency ?? 'USD'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Total Charges"
              value={`-${usd(Math.abs(charges))}`}
              sub="Min $4/trade"
              accent="yellow"
              icon={DollarSign}
            />
            <StatCard
              label="Raw P&L"
              value={signed(rawPnl)}
              sub="From closed trades"
              accent={rawPnl >= 0 ? 'green' : 'red'}
              icon={TrendingUp}
            />
            <StatCard
              label="Net P&L"
              value={signed(netPnl)}
              sub="After charges"
              accent={netPnl >= 0 ? 'green' : 'red'}
              icon={BarChart3}
            />
            <StatCard
              label="Floating P&L"
              value={signed(floating)}
              sub="Open positions"
              accent={floating >= 0 ? 'green' : 'red'}
              icon={Activity}
            />
            <StatCard
              label="Free Margin"
              value={usd(freeMargin)}
              sub="Available for trading"
              accent="cyan"
              icon={Gauge}
            />
          </div>
        </div>

        {/* Capital / wallet row */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-800 pt-6 lg:grid-cols-4">
          <Mini label="Locked Capital" value={usd(locked)} sub="Minimum required" accent="text-orange-400" icon={Lock} />
          <Mini label="Balance" value={usd(balance)} sub="Total funds" accent="text-white" icon={WalletIcon} />
          <Mini label="Profit Wallet" value={usd(profit)} sub="Above locked capital" accent="text-green-400" icon={TrendingUp} />
          <Mini label="Withdrawable" value={usd(withdrawable)} sub="Available to withdraw" accent="text-cyan-400" icon={DollarSign} />
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total Trades" value={items.length} accent="blue" icon={Activity} />
        <StatCard label="Open Orders" value={openOrders} accent="orange" icon={ListChecks} />
        <StatCard
          label="Total Volume"
          value={totalVolume.toLocaleString()}
          accent="purple"
          icon={BarChart3}
        />
      </div>

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Recent trades</h3>
          <span className="text-xs text-zinc-500">{recent.length} shown</span>
        </div>
        {trades.isLoading ? (
          <Loader label="Loading trades…" />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No trades yet"
            sub="Trades appear here as they execute."
          />
        ) : (
          <DataTable>
            <thead className="border-b border-zinc-800 bg-zinc-800/40">
              <tr>
                <Th>Time</Th>
                <Th>Trade ID</Th>
                <Th>Symbol</Th>
                <Th>Side</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.tradeId} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                  <Td className="whitespace-nowrap text-zinc-400">{formatDateTime(t.executedAt)}</Td>
                  <Td className="font-mono text-xs">{t.tradeId}</Td>
                  <Td>{t.symbol}</Td>
                  <Td>
                    <Badge color={t.side === 'BUY' ? 'green' : 'red'}>{t.side}</Badge>
                  </Td>
                  <Td className="text-right">{t.quantity}</Td>
                  <Td className="text-right">{t.price}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  icon: typeof Lock;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <Icon size={15} className={accent} />
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs text-zinc-500">{sub}</p>
    </div>
  );
}
