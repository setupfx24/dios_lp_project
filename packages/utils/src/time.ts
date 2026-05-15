/**
 * Treat all server timestamps as UTC ISO-8601 strings. This module
 * deliberately does no localization — UI converts at the display layer.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoToDate(iso: string): Date {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`isoToDate: invalid ISO timestamp: ${iso}`);
  }
  return new Date(ms);
}

export function isIso(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

/** Inclusive lower bound, exclusive upper bound. */
export function isWithin(at: Date, fromInclusive: Date, toExclusive: Date): boolean {
  const t = at.getTime();
  return t >= fromInclusive.getTime() && t < toExclusive.getTime();
}

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}
