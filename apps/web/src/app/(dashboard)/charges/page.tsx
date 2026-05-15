'use client';

import { Money } from '@lp/utils/money';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTrades } from '@/features/trades/use-trades';
import { formatMoney } from '@/lib/format';

export default function ChargesPage() {
  const { data, isLoading, error } = useTrades({ limit: 100 });

  // Per-trade totals are computed server-side via /trades/:id; here we show
  // a placeholder summary based on listed trade values until the detail
  // calls are joined into the listing endpoint.
  const totalTurnover =
    data?.items.reduce((acc, t) => acc.add(new Money(t.quantity).mul(t.price)), Money.zero()) ??
    Money.zero();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Charges</h1>
      <Card>
        <CardHeader>
          <CardTitle>Summary (last 100 trades)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">
              Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}
          {data && (
            <dl className="grid gap-2 text-sm">
              <Row label="Trades">{data.items.length}</Row>
              <Row label="Gross turnover">{formatMoney(totalTurnover)}</Row>
              <p className="mt-2 text-xs text-muted-foreground">
                Per-trade itemized charges (brokerage, STT, GST, exchange &amp; SEBI fees, stamp
                duty) appear in each trade&rsquo;s detail view.
              </p>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b pb-1 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
