import { ulid as ulidLib, decodeTime } from 'ulid';

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Crockford-base32 ULID. 26 chars, time-prefixed and lexicographically
 * sortable. Used for all external-facing IDs (`tradeId`, `orderId`,
 * `apiKeyId`) — leaks less than UUIDs, sorts naturally in indexes.
 */
export function ulid(seedTimeMs?: number): string {
  return seedTimeMs === undefined ? ulidLib() : ulidLib(seedTimeMs);
}

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_REGEX.test(value);
}

export function ulidTime(value: string): Date {
  if (!ULID_REGEX.test(value)) {
    throw new TypeError(`ulidTime: not a valid ULID: ${value}`);
  }
  return new Date(decodeTime(value));
}
