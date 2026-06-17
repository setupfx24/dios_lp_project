'use client';

import { Activity, BarChart3, ListChecks, TrendingUp, Wallet as WalletIcon } from 'lucide-react';

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
import { useMe, useOrders, useWallet } from '@/features/account/hooks';
import { useTrades } from '@/features/trades/use-trades';
import { formatDateTime } from '@/lib/format';

function usd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const me = useMe();
  const wallet = useWallet();
  const trades = useTrades({ limit: 200 });
  const orders = useOrders({ limit: 200 });

  const items = trades.data?.items ?? [];
  const orderItems = orders.data?.items ?? [];
  const totalVolume = items.reduce((s, t) => s + Number(t.quantity), 0);
  const totalNotional = items.reduce((s, t) => s + Number(t.quantity) * Number(t.price), 0);
  const openOrders = orderItems.filter(
    (o) => o.status === 'PENDING' || o.status === 'ACCEPTED',
  ).length;
  const primary = wallet.data?.wallets[0];
  const balance = primary ? Number(primary.balance) : 0;
  const recent = items.slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={me.data ? `Welcome back, ${me.data.broker.displayName}` : undefined}
      />

      <Card className="mb-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
              <WalletIcon className="text-green-500" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Wallet Balance</p>
              <p className="text-4xl font-bold text-white">{usd(balance)}</p>
              <p className="text-xs text-zinc-500">{primary?.currency ?? 'USD'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Total Trades" value={items.length} accent="blue" icon={Activity} />
            <StatCard label="Open Orders" value={openOrders} accent="orange" icon={ListChecks} />
            <StatCard
              label="Total Volume"
              value={totalVolume.toLocaleString()}
              accent="purple"
              icon={BarChart3}
            />
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-4 font-semibold text-white">Account information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Info label="Name" value={me.data?.broker.displayName ?? '—'} />
          <Info label="Email" value={me.data?.broker.contactEmail ?? '—'} />
          <Info label="Broker ID" value={me.data?.broker.brokerId ?? '—'} mono />
          <Info label="Status" value={me.data?.broker.status ?? '—'} />
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Notional Traded"
          value={usd(totalNotional)}
          accent="cyan"
          icon={TrendingUp}
        />
        <StatCard
          label="Symbols"
          value={new Set(items.map((t) => t.symbol)).size}
          accent="white"
          icon={BarChart3}
        />
        <StatCard label="Orders" value={orderItems.length} accent="white" icon={ListChecks} />
        <StatCard
          label="Account"
          value={me.data?.broker.status ?? '—'}
          accent="green"
          icon={Activity}
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
                  <Td className="whitespace-nowrap text-zinc-400">
                    {formatDateTime(t.executedAt)}
                  </Td>
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

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-sm text-zinc-200 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
