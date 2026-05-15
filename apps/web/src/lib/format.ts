import { Money } from '@lp/utils/money';

/** Indian-grouped INR formatting via the Money class. Never coerces to number. */
export function formatMoney(value: string | Money, decimals = 2): string {
  return Money.from(value).format(decimals);
}

/** Compact, broker-local timestamp. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(d);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-IN', { timeStyle: 'medium' }).format(d);
}
