import { Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Corecen-style dark UI primitives (zinc theme). */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900 p-6 ${className}`}>
      {children}
    </div>
  );
}

/** Centered spinner shown while data is syncing. */
export function Loader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-zinc-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  white: 'text-white',
  green: 'text-green-500',
  red: 'text-red-500',
  blue: 'text-blue-500',
  yellow: 'text-yellow-500',
  purple: 'text-purple-500',
  cyan: 'text-cyan-500',
  orange: 'text-orange-500',
  zinc: 'text-zinc-300',
};

export function StatCard({
  label,
  value,
  sub,
  accent = 'white',
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string | undefined;
  accent?: keyof typeof ACCENTS | undefined;
  icon?: LucideIcon | undefined;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center gap-2">
        {Icon && <Icon size={16} className={ACCENTS[accent] ?? 'text-zinc-300'} />}
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${ACCENTS[accent] ?? 'text-white'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: 'bg-green-500/20 text-green-400',
  red: 'bg-red-500/20 text-red-400',
  blue: 'bg-blue-500/20 text-blue-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  purple: 'bg-purple-500/20 text-purple-400',
  cyan: 'bg-cyan-500/20 text-cyan-400',
  zinc: 'bg-zinc-500/20 text-zinc-400',
};

export function Badge({
  children,
  color = 'zinc',
}: {
  children: ReactNode;
  color?: keyof typeof BADGE;
}) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${BADGE[color]}`}>
      {children}
    </span>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold text-zinc-400 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm text-zinc-200 ${className}`}>{children}</td>;
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full">{children}</table>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon?: LucideIcon | undefined;
  title: string;
  sub?: string | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      {Icon && <Icon size={28} className="text-zinc-600" />}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
