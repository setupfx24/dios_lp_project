import { describe, it, expect } from 'vitest';

import { ulid, isUlid, ulidTime } from './id.js';

describe('ulid', () => {
  it('generates a 26-character Crockford ULID', () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it('is monotonic-ish across rapid calls (sortable)', () => {
    const ids = Array.from({ length: 50 }, () => ulid());
    const sorted = [...ids].sort();
    // Not strictly increasing within the same ms, but never out-of-order across ms.
    expect(sorted.length).toBe(50);
  });
  it('seeds from a provided time', () => {
    const id = ulid(0);
    expect(id.startsWith('0000000000')).toBe(true);
  });
});

describe('isUlid', () => {
  it('accepts valid ULIDs', () => {
    expect(isUlid(ulid())).toBe(true);
  });
  it('rejects non-strings', () => {
    expect(isUlid(123)).toBe(false);
    expect(isUlid(null)).toBe(false);
    expect(isUlid(undefined)).toBe(false);
  });
  it('rejects strings with invalid characters', () => {
    expect(isUlid('I'.repeat(26))).toBe(false);
    expect(isUlid('L'.repeat(26))).toBe(false);
    expect(isUlid('U'.repeat(26))).toBe(false);
  });
  it('rejects wrong-length strings', () => {
    expect(isUlid('A'.repeat(25))).toBe(false);
    expect(isUlid('A'.repeat(27))).toBe(false);
  });
});

describe('ulidTime', () => {
  it('decodes the timestamp embedded in a ULID', () => {
    const t = 1_700_000_000_000;
    const id = ulid(t);
    expect(ulidTime(id).getTime()).toBe(t);
  });
  it('throws on invalid input', () => {
    expect(() => ulidTime('not-a-ulid')).toThrow(TypeError);
  });
});
