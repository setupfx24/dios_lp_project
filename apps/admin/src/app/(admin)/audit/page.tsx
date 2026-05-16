'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JsonDiff } from '@/features/audit/json-diff';
import { adminApi } from '@/lib/sdk';

interface Filters {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  from: string;
  to: string;
  limit: string;
}

interface AuditRow {
  id: string;
  auditId: string;
  actorType: 'user' | 'broker_api' | 'system';
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: 'success' | 'failure';
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const [pendingFilters, setPendingFilters] = useState<Filters>({
    actorId: '',
    action: '',
    resourceType: '',
    resourceId: '',
    from: '',
    to: '',
    limit: '100',
  });
  const [filters, setFilters] = useState<Filters>(pendingFilters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () =>
      adminApi.listAudit({
        actorId: filters.actorId || undefined,
        action: filters.action || undefined,
        resourceType: filters.resourceType || undefined,
        resourceId: filters.resourceId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        limit: Number(filters.limit) || 100,
      }),
  });

  const items = (data?.items ?? []) as AuditRow[];

  const csv = useMemo(() => buildCsv(items), [items]);

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpanded(next);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Audit log</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(pendingFilters);
            }}
          >
            <Field
              id="actorId"
              label="Actor ID"
              value={pendingFilters.actorId}
              onChange={(v) => setPendingFilters({ ...pendingFilters, actorId: v })}
            />
            <Field
              id="action"
              label="Action"
              value={pendingFilters.action}
              onChange={(v) => setPendingFilters({ ...pendingFilters, action: v })}
              placeholder="e.g. wallet.adjust"
            />
            <Field
              id="resourceType"
              label="Resource type"
              value={pendingFilters.resourceType}
              onChange={(v) => setPendingFilters({ ...pendingFilters, resourceType: v })}
              placeholder="e.g. wallet"
            />
            <Field
              id="resourceId"
              label="Target ID (broker / wallet)"
              value={pendingFilters.resourceId}
              onChange={(v) => setPendingFilters({ ...pendingFilters, resourceId: v })}
              placeholder="broker_id or other resource id"
            />
            <Field
              id="from"
              label="From (ISO)"
              value={pendingFilters.from}
              onChange={(v) => setPendingFilters({ ...pendingFilters, from: v })}
              placeholder="2026-05-01T00:00:00Z"
            />
            <Field
              id="to"
              label="To (ISO)"
              value={pendingFilters.to}
              onChange={(v) => setPendingFilters({ ...pendingFilters, to: v })}
              placeholder="2026-05-31T23:59:59Z"
            />
            <Field
              id="limit"
              label="Limit"
              value={pendingFilters.limit}
              onChange={(v) => setPendingFilters({ ...pendingFilters, limit: v })}
            />
            <div className="md:col-span-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const cleared: Filters = {
                    actorId: '',
                    action: '',
                    resourceType: '',
                    resourceId: '',
                    from: '',
                    to: '',
                    limit: '100',
                  };
                  setPendingFilters(cleared);
                  setFilters(cleared);
                }}
              >
                Clear
              </Button>
              <Button type="submit">Apply filters</Button>
              <Button asChild variant="outline" size="default" disabled={items.length === 0}>
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
                  download={`audit-${new Date().toISOString().slice(0, 19)}.csv`}
                >
                  <Download className="mr-2 h-4 w-4" /> CSV ({items.length})
                </a>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load: {error instanceof Error ? error.message : 'unknown'}
        </p>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No audit rows match these filters.</p>
      )}

      {items.length > 0 && (
        <div className="rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left">
                <Th className="w-6"></Th>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Outcome</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const isOpen = expanded.has(row.auditId);
                return (
                  <Row
                    key={row.auditId}
                    row={row}
                    isOpen={isOpen}
                    onToggle={() => toggle(row.auditId)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium text-muted-foreground ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function Row({ row, isOpen, onToggle }: { row: AuditRow; isOpen: boolean; onToggle: () => void }) {
  const before = (row.metadata?.beforeState ?? undefined) as Record<string, unknown> | undefined;
  const after = (row.metadata?.afterState ?? undefined) as Record<string, unknown> | undefined;
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/30">
        <Td className="text-muted-foreground">
          <button onClick={onToggle} aria-label="toggle row">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </Td>
        <Td className="font-mono text-xs">{row.createdAt}</Td>
        <Td className="font-mono text-xs">{`${row.actorType}:${row.actorId}`}</Td>
        <Td>{row.action}</Td>
        <Td className="text-xs text-muted-foreground">
          {row.resourceType ? `${row.resourceType}/${row.resourceId ?? '—'}` : '—'}
        </Td>
        <Td>
          <span
            className={
              row.outcome === 'success'
                ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900'
                : 'rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-900'
            }
          >
            {row.outcome}
          </span>
        </Td>
      </tr>
      {isOpen && (
        <tr className="border-b last:border-0 bg-muted/20">
          <td colSpan={6} className="px-3 py-3">
            <JsonDiff before={before as never} after={after as never} />
            {row.metadata && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Full metadata</summary>
                <pre className="mt-1 overflow-x-auto rounded border bg-muted/40 p-2 font-mono">
                  {JSON.stringify(row.metadata, null, 2)}
                </pre>
              </details>
            )}
            {(row.ipAddress ?? row.userAgent) !== null && (
              <p className="mt-2 text-xs text-muted-foreground">
                {row.ipAddress && <>IP: {row.ipAddress} </>}
                {row.userAgent && <>UA: {row.userAgent}</>}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function buildCsv(rows: readonly AuditRow[]): string {
  const cols: (keyof AuditRow)[] = [
    'createdAt',
    'actorType',
    'actorId',
    'action',
    'resourceType',
    'resourceId',
    'outcome',
    'ipAddress',
    'auditId',
  ];
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          const v = r[c];
          if (v === null || v === undefined) {
            return '';
          }
          return `"${String(v).replaceAll('"', '""')}"`;
        })
        .join(','),
    );
  }
  return lines.join('\n');
}
