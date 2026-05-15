import { describe, it, expect } from 'vitest';

import { sign, verify, HMAC_REPLAY_WINDOW_MS } from './hmac.js';

const SECRET = 'test-secret-with-sufficient-entropy';
const NOW = 1_700_000_000_000;

const baseMaterial = {
  timestamp: String(NOW),
  body: '{"orderId":"abc","qty":"10","price":"100"}',
  requestLine: 'POST /v1/orders',
};

describe('hmac.sign', () => {
  it('returns a 64-char hex string', () => {
    expect(sign(SECRET, baseMaterial)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic for identical inputs', () => {
    expect(sign(SECRET, baseMaterial)).toBe(sign(SECRET, baseMaterial));
  });
  it('changes when body changes', () => {
    const a = sign(SECRET, baseMaterial);
    const b = sign(SECRET, { ...baseMaterial, body: baseMaterial.body + ' ' });
    expect(a).not.toBe(b);
  });
  it('changes when timestamp changes', () => {
    const a = sign(SECRET, baseMaterial);
    const b = sign(SECRET, { ...baseMaterial, timestamp: String(NOW + 1) });
    expect(a).not.toBe(b);
  });
  it('changes when secret changes', () => {
    expect(sign(SECRET, baseMaterial)).not.toBe(sign('other-secret', baseMaterial));
  });
  it('rejects empty secret', () => {
    expect(() => sign('', baseMaterial)).toThrow(TypeError);
  });
});

describe('hmac.verify', () => {
  it('accepts a valid signature within the replay window', () => {
    const sig = sign(SECRET, baseMaterial);
    expect(verify(SECRET, baseMaterial, sig, { nowMs: NOW })).toEqual({ valid: true });
  });
  it('accepts at the replay-window edge', () => {
    const sig = sign(SECRET, baseMaterial);
    expect(verify(SECRET, baseMaterial, sig, { nowMs: NOW + HMAC_REPLAY_WINDOW_MS })).toEqual({
      valid: true,
    });
  });
  it('rejects past the replay window', () => {
    const sig = sign(SECRET, baseMaterial);
    expect(verify(SECRET, baseMaterial, sig, { nowMs: NOW + HMAC_REPLAY_WINDOW_MS + 1 })).toEqual({
      valid: false,
      reason: 'STALE_TIMESTAMP',
    });
  });
  it('rejects future timestamps past the window', () => {
    const sig = sign(SECRET, baseMaterial);
    expect(verify(SECRET, baseMaterial, sig, { nowMs: NOW - HMAC_REPLAY_WINDOW_MS - 1 })).toEqual({
      valid: false,
      reason: 'STALE_TIMESTAMP',
    });
  });
  it('rejects a body tamper', () => {
    const sig = sign(SECRET, baseMaterial);
    const tampered = { ...baseMaterial, body: baseMaterial.body.replace('100', '999') };
    expect(verify(SECRET, tampered, sig, { nowMs: NOW })).toEqual({
      valid: false,
      reason: 'INVALID_SIGNATURE',
    });
  });
  it('rejects a wrong-length signature', () => {
    expect(verify(SECRET, baseMaterial, 'short', { nowMs: NOW })).toEqual({
      valid: false,
      reason: 'INVALID_SIGNATURE',
    });
  });
  it('rejects a non-hex signature', () => {
    expect(verify(SECRET, baseMaterial, 'z'.repeat(64), { nowMs: NOW })).toEqual({
      valid: false,
      reason: 'INVALID_SIGNATURE',
    });
  });
  it('rejects unparseable timestamp', () => {
    expect(
      verify(SECRET, { ...baseMaterial, timestamp: 'not-a-time' }, 'a'.repeat(64), { nowMs: NOW }),
    ).toEqual({ valid: false, reason: 'BAD_TIMESTAMP' });
  });
  it('accepts ISO-8601 timestamps', () => {
    const isoMaterial = { ...baseMaterial, timestamp: new Date(NOW).toISOString() };
    const sig = sign(SECRET, isoMaterial);
    expect(verify(SECRET, isoMaterial, sig, { nowMs: NOW })).toEqual({ valid: true });
  });
});
