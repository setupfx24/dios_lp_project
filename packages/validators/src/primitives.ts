import { z } from 'zod';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const POS_DECIMAL_RE = /^(0\.\d*[1-9]\d*|[1-9]\d*(\.\d+)?)$/;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Money fields cross the wire as decimal strings — never JS numbers.
 * Server-side this becomes a `Money` instance via `Money.from(...)`.
 */
export const decimalString = z
  .string()
  .trim()
  .regex(DECIMAL_RE, 'must be a decimal string (e.g. "100.25")')
  .refine((s) => s !== '-0', 'negative zero not allowed');

export const positiveDecimalString = z
  .string()
  .trim()
  .regex(POS_DECIMAL_RE, 'must be a positive decimal string > 0');

export const ulidString = z.string().regex(ULID_RE, 'must be a 26-char Crockford ULID');

export const isoTimestamp = z
  .string()
  .refine((s) => Number.isFinite(Date.parse(s)), 'must be an ISO-8601 timestamp');

export const symbolString = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9_.-]+$/, 'symbol must be uppercase alphanumeric (with _ . -)');

export const brokerIdString = z.string().min(1).max(64);
