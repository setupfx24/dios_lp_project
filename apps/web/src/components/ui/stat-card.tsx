import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'info';
  className?: string;
}

const toneStyles: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-card text-card-foreground',
  positive: 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50',
  negative: 'bg-rose-50 text-rose-950 dark:bg-rose-950/30 dark:text-rose-50',
  warning: 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50',
  info: 'bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-50',
};

const iconToneStyles: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-muted text-muted-foreground',
  positive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  negative: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5',
        toneStyles[tone],
        className,
      )}
    >
      {Icon ? (
        <div className={cn('shrink-0 rounded-md p-2', iconToneStyles[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide opacity-70 sm:text-sm">{label}</p>
        <p className="mt-1 break-words text-2xl font-semibold leading-tight sm:text-3xl">{value}</p>
        {hint ? <p className="mt-1 text-xs opacity-70 sm:text-sm">{hint}</p> : null}
      </div>
    </div>
  );
}
