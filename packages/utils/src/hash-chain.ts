import { createHash } from 'node:crypto';

/**
 * 64-char hex SHA-256 of zero, used as `prevHash` for the first trade in a
 * broker's chain. Choosing a fixed sentinel (rather than null) keeps the
 * chain validation logic uniform.
 */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Recursively serialize `value` to a deterministic JSON string:
 *   - object keys sorted lexicographically
 *   - no whitespace
 *   - undefined fields dropped
 *   - Date → ISO string
 *   - bigint → decimal string
 *   - object with `toJSON` (incl. Money) uses its return value
 *
 * Two equal-by-value records always produce identical output. This is what
 * makes the trade hash chain verifiable.
 */
export function canonicalize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'undefined':
      return 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalize: non-finite number ${value} not allowed`);
      }
      return String(value);
    case 'bigint':
      return JSON.stringify(value.toString());
    case 'string':
      return JSON.stringify(value);
    case 'function':
    case 'symbol':
      throw new TypeError(`canonicalize: cannot serialize ${typeof value}`);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  // Anything with a custom toJSON (e.g. Money)
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    const replaced = (value as { toJSON: () => unknown }).toJSON();
    return canonicalize(replaced);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const v = obj[key];
    if (v === undefined) {
      continue;
    }
    parts.push(JSON.stringify(key) + ':' + canonicalize(v));
  }
  return '{' + parts.join(',') + '}';
}

/**
 * Hash of `prevHash` concatenated with the canonical JSON of `record`.
 * Hex-encoded SHA-256.
 */
export function computeHash(record: unknown, prevHash: string): string {
  if (!/^[0-9a-f]{64}$/i.test(prevHash)) {
    throw new TypeError(`computeHash: prevHash must be 64-hex, got ${prevHash}`);
  }
  const payload = prevHash + '|' + canonicalize(record);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Walk an ordered chain of records, recomputing the hash for each and
 * comparing against the stored hash. Returns the index of the first
 * mismatch, or -1 if the chain is intact.
 */
export interface ChainItem {
  readonly hash: string;
  readonly prevHash: string;
  readonly record: unknown;
}

export function verifyChain(items: readonly ChainItem[]): number {
  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) {
      return i;
    }
    if (item.prevHash !== expectedPrev) {
      return i;
    }
    const recomputed = computeHash(item.record, item.prevHash);
    if (recomputed !== item.hash) {
      return i;
    }
    expectedPrev = item.hash;
  }
  return -1;
}
