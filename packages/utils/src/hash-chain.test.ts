import { describe, it, expect } from 'vitest';

import {
  GENESIS_HASH,
  canonicalize,
  computeHash,
  verifyChain,
  type ChainItem,
} from './hash-chain.js';
import { Money } from './money.js';

describe('canonicalize', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('produces identical output for differently-ordered equal objects', () => {
    const a = canonicalize({ qty: '10', symbol: 'AAA', price: '100' });
    const b = canonicalize({ symbol: 'AAA', price: '100', qty: '10' });
    expect(a).toBe(b);
  });
  it('drops undefined fields', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it('serializes Date as ISO string', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(canonicalize({ at: d })).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
  });
  it('serializes nested arrays and objects deterministically', () => {
    expect(canonicalize({ xs: [{ b: 2, a: 1 }, { a: 3 }] })).toBe('{"xs":[{"a":1,"b":2},{"a":3}]}');
  });
  it('uses Money.toJSON for Money instances', () => {
    expect(canonicalize({ price: new Money('99.50') })).toBe('{"price":"99.5"}');
  });
  it('serializes bigint as a JSON string', () => {
    expect(canonicalize({ n: 9007199254740993n })).toBe('{"n":"9007199254740993"}');
  });
  it('rejects functions and symbols', () => {
    expect(() => canonicalize({ f: () => 1 })).toThrow(TypeError);
    expect(() => canonicalize({ s: Symbol('x') })).toThrow(TypeError);
  });
  it('rejects non-finite numbers', () => {
    expect(() => canonicalize({ n: NaN })).toThrow(TypeError);
    expect(() => canonicalize({ n: Infinity })).toThrow(TypeError);
  });
});

describe('computeHash', () => {
  it('produces a 64-char hex string', () => {
    const h = computeHash({ a: 1 }, GENESIS_HASH);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic across calls', () => {
    const r = { tradeId: 'X', qty: '10', price: '100' };
    expect(computeHash(r, GENESIS_HASH)).toBe(computeHash(r, GENESIS_HASH));
  });
  it('changes when prevHash changes', () => {
    const r = { a: 1 };
    const other = 'a'.repeat(64);
    expect(computeHash(r, GENESIS_HASH)).not.toBe(computeHash(r, other));
  });
  it('changes when any field changes', () => {
    const a = computeHash({ qty: '10' }, GENESIS_HASH);
    const b = computeHash({ qty: '11' }, GENESIS_HASH);
    expect(a).not.toBe(b);
  });
  it('rejects malformed prevHash', () => {
    expect(() => computeHash({ a: 1 }, 'short')).toThrow(TypeError);
    expect(() => computeHash({ a: 1 }, 'z'.repeat(64))).toThrow(TypeError);
  });
});

describe('verifyChain', () => {
  function makeChain(records: readonly Record<string, unknown>[]): ChainItem[] {
    let prev = GENESIS_HASH;
    return records.map((record) => {
      const hash = computeHash(record, prev);
      const item: ChainItem = { record, prevHash: prev, hash };
      prev = hash;
      return item;
    });
  }

  it('returns -1 for an empty chain', () => {
    expect(verifyChain([])).toBe(-1);
  });
  it('returns -1 for a valid chain', () => {
    const chain = makeChain([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    expect(verifyChain(chain)).toBe(-1);
  });
  it('detects tampering with a record (mid-chain)', () => {
    const chain = makeChain([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const tampered: ChainItem[] = [chain[0]!, { ...chain[1]!, record: { id: 999 } }, chain[2]!];
    expect(verifyChain(tampered)).toBe(1);
  });
  it('detects a broken prevHash link', () => {
    const chain = makeChain([{ id: 1 }, { id: 2 }]);
    const broken: ChainItem[] = [chain[0]!, { ...chain[1]!, prevHash: GENESIS_HASH }];
    expect(verifyChain(broken)).toBe(1);
  });
  it('detects a forged hash', () => {
    const chain = makeChain([{ id: 1 }]);
    const forged: ChainItem[] = [{ ...chain[0]!, hash: 'f'.repeat(64) }];
    expect(verifyChain(forged)).toBe(0);
  });
});
