'use client';

import {
  CheckCircle2,
  ExternalLink,
  type LucideIcon,
  Mail,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CreateBrokerModal } from '@/features/brokers/create-broker-modal';
import { useBrokers } from '@/features/brokers/use-brokers';

const STATUS_PILL: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  closed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default function BrokersPage() {
  const { data, isLoading, error, refetch, isFetching } = useBrokers();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((b) => {
      if (filter !== 'all' && b.status !== filter) return false;
      if (!q) return true;
      return (
        b.brokerId.toLowerCase().includes(q) ||
        b.displayName.toLowerCase().includes(q) ||
        b.contactEmail.toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  const counts = useMemo(() => {
    if (!data) return { total: 0, active: 0, suspended: 0 };
    return {
      total: data.length,
      active: data.filter((b) => b.status === 'active').length,
      suspended: data.filter((b) => b.status === 'suspended').length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
            Brokers
          </h1>
          <p className="text-sm text-muted-foreground">
            Create broker records, manage their API keys, suspend / reactivate. Every action is
            audited.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetch();
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New broker
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <SummaryCard label="Total brokers" value={counts.total} icon={Users} />
        <SummaryCard label="Active" value={counts.active} icon={CheckCircle2} tone="success" />
        <SummaryCard label="Suspended" value={counts.suspended} icon={PauseCircle} tone="warning" />
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>All brokers</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by ID, name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 rounded-md border bg-muted/50 p-1">
              {(['all', 'active', 'suspended'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                    filter === f
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {data && data.length === 0
                ? 'No brokers yet. Click "New broker" to create the first one.'
                : 'No brokers match these filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Broker ID</th>
                    <th className="px-3 py-2 font-medium">Display name</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2 text-right font-medium">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.brokerId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{b.brokerId}</td>
                      <td className="px-3 py-2 font-medium">{b.displayName}</td>
                      <td className="px-3 py-2">
                        <a
                          href={`mailto:${b.contactEmail}`}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {b.contactEmail}
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ${
                            STATUS_PILL[b.status] ?? 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {b.status === 'active' ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : b.status === 'suspended' ? (
                            <PauseCircle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {b.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {fmtDate(b.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/brokers/${encodeURIComponent(b.brokerId)}`}
                          className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
                        >
                          Manage
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate ? <CreateBrokerModal onClose={() => setShowCreate(false)} /> : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
        : 'bg-card text-card-foreground';
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="rounded-md bg-background/60 p-2">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-2xl font-semibold leading-tight">{value.toLocaleString('en-IN')}</p>
      </div>
    </div>
  );
}
