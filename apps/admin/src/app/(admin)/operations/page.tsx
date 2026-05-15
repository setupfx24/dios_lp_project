'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi } from '@/lib/sdk';

export default function OperationsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ops-metrics'],
    queryFn: () => adminApi.operationsMetrics(),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Operations</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load metrics: {error instanceof Error ? error.message : 'unknown'}
        </p>
      )}
      {data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Metric label="Orders queue depth" value={data.queueDepth} />
          <Metric label="Total trades" value={data.tradesTotal} />
          <Metric label="Snapshot" value={new Date(data.timestamp).toLocaleTimeString()} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-primary">{value}</div>
      </CardContent>
    </Card>
  );
}
