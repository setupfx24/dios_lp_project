import { describe, it, expect } from 'vitest';

import { nowIso, isoToDate, isIso, isWithin, addMs } from './time.js';

describe('time helpers', () => {
  it('nowIso returns a valid ISO string', () => {
    expect(isIso(nowIso())).toBe(true);
  });
  it('isoToDate round-trips', () => {
    const iso = '2026-05-15T12:30:45.123Z';
    expect(isoToDate(iso).toISOString()).toBe(iso);
  });
  it('isoToDate rejects garbage', () => {
    expect(() => isoToDate('not-a-date')).toThrow(TypeError);
  });
  it('isIso accepts UTC and offset forms', () => {
    expect(isIso('2026-01-01T00:00:00Z')).toBe(true);
    expect(isIso('2026-01-01T00:00:00.000Z')).toBe(true);
    expect(isIso('2026-01-01T00:00:00+05:30')).toBe(true);
  });
  it('isIso rejects non-strings & wrong shapes', () => {
    expect(isIso(123)).toBe(false);
    expect(isIso('2026-01-01')).toBe(false);
  });
  it('isWithin honors inclusive lower / exclusive upper', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    expect(isWithin(from, from, to)).toBe(true);
    expect(isWithin(to, from, to)).toBe(false);
  });
  it('addMs adds milliseconds without mutating', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    const after = addMs(d, 1500);
    expect(after.toISOString()).toBe('2026-01-01T00:00:01.500Z');
    expect(d.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
