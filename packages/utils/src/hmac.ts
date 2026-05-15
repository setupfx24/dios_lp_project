import { createHmac, timingSafeEqual } from 'node:crypto';

export const HMAC_ALGORITHM = 'sha256';
export const HMAC_REPLAY_WINDOW_MS = 30_000;

export interface SignatureMaterial {
  /** ISO-8601 or epoch-millis as a string. Must round-trip identically client/server. */
  readonly timestamp: string;
  /** Raw request body bytes (or canonical JSON). Must be the exact bytes the server hashes. */
  readonly body: string;
  /** Optional method+path concatenation, e.g. "POST /v1/orders". Recommended. */
  readonly requestLine?: string;
}

function payload(material: SignatureMaterial): string {
  // Order matters; both sides must agree.
  return [material.timestamp, material.requestLine ?? '', material.body].join('\n');
}

export function sign(secret: string, material: SignatureMaterial): string {
  if (!secret) {
    throw new TypeError('hmac.sign: secret must be non-empty');
  }
  return createHmac(HMAC_ALGORITHM, secret).update(payload(material), 'utf8').digest('hex');
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'INVALID_SIGNATURE' | 'STALE_TIMESTAMP' | 'BAD_TIMESTAMP' };

export interface VerifyOptions {
  readonly nowMs?: number;
  readonly windowMs?: number;
}

export function verify(
  secret: string,
  material: SignatureMaterial,
  signature: string,
  opts: VerifyOptions = {},
): VerifyResult {
  const nowMs = opts.nowMs ?? Date.now();
  const windowMs = opts.windowMs ?? HMAC_REPLAY_WINDOW_MS;

  const tsMs = parseTimestamp(material.timestamp);
  if (tsMs === null) {
    return { valid: false, reason: 'BAD_TIMESTAMP' };
  }
  if (Math.abs(nowMs - tsMs) > windowMs) {
    return { valid: false, reason: 'STALE_TIMESTAMP' };
  }

  const expected = sign(secret, material);
  if (!constantTimeEqualHex(expected, signature)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
  return { valid: true };
}

function parseTimestamp(s: string): number | null {
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let aBuf: Buffer;
  let bBuf: Buffer;
  try {
    aBuf = Buffer.from(a, 'hex');
    bBuf = Buffer.from(b, 'hex');
  } catch {
    return false;
  }
  if (aBuf.length !== bBuf.length || aBuf.length === 0) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
