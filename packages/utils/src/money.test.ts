import { describe, it, expect } from 'vitest';

import { Money } from './money.js';

describe('Money — construction', () => {
  it('accepts decimal strings', () => {
    expect(new Money('123.45').toString()).toBe('123.45');
  });
  it('accepts integer literals', () => {
    expect(new Money(100).toString()).toBe('100');
  });
  it('accepts another Money instance', () => {
    const a = new Money('5.5');
    expect(new Money(a).toString()).toBe('5.5');
  });
  it('rejects fractional JS Numbers', () => {
    expect(() => new Money(1.1)).toThrow(TypeError);
  });
  it('rejects NaN / Infinity', () => {
    expect(() => new Money(NaN)).toThrow(TypeError);
    expect(() => new Money(Infinity)).toThrow(TypeError);
  });
  it('rejects malformed strings', () => {
    expect(() => new Money('abc')).toThrow(TypeError);
    expect(() => new Money('')).toThrow(TypeError);
    expect(() => new Money('1.2.3')).toThrow(TypeError);
    expect(() => new Money('1e5')).toThrow(TypeError);
  });
  it('handles negatives', () => {
    expect(new Money('-12.34').toString()).toBe('-12.34');
  });
});

describe('Money — arithmetic precision', () => {
  it('adds without binary float drift (0.1 + 0.2 === 0.3)', () => {
    expect(new Money('0.1').add('0.2').toString()).toBe('0.3');
  });
  it('subtracts large numbers exactly', () => {
    expect(new Money('1000000000.12345').sub('1000000000.12340').toString()).toBe('0.00005');
  });
  it('multiplies without rounding', () => {
    expect(new Money('1.23456').mul('100000').toString()).toBe('123456');
  });
  it('divides exact ratios', () => {
    expect(new Money('100').div('4').toString()).toBe('25');
  });
  it('throws on division by zero', () => {
    expect(() => new Money('1').div('0')).toThrow(RangeError);
  });
  it('chains arithmetic immutably', () => {
    const a = new Money('10');
    const b = a.add('5').mul('2').sub('1');
    expect(a.toString()).toBe('10');
    expect(b.toString()).toBe('29');
  });
});

describe('Money — comparison & predicates', () => {
  it('compares correctly', () => {
    expect(new Money('1').lt('2')).toBe(true);
    expect(new Money('2').gt('1')).toBe(true);
    expect(new Money('1').eq('1.0')).toBe(true);
    expect(new Money('1').lte('1')).toBe(true);
    expect(new Money('1').gte('1')).toBe(true);
  });
  it('isZero / isNegative / isPositive', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(new Money('-1').isNegative()).toBe(true);
    expect(new Money('1').isPositive()).toBe(true);
    expect(Money.zero().isNegative()).toBe(false);
    expect(Money.zero().isPositive()).toBe(false);
  });
});

describe('Money — rounding', () => {
  it('rounds to 4dp by default (banker’s rounding)', () => {
    expect(new Money('1.23455').round().toString()).toBe('1.2346');
    expect(new Money('1.23445').round().toString()).toBe('1.2344');
  });
  it('rounds to specified decimals', () => {
    expect(new Money('1.005').round(2).toString()).toBe('1');
  });
});

describe('Money — Indian currency formatting', () => {
  it('formats small amounts', () => {
    expect(new Money('1234.5').format()).toBe('₹1,234.50');
  });
  it('formats lakh values with Indian commas', () => {
    expect(new Money('123456.78').format()).toBe('₹1,23,456.78');
  });
  it('formats crore values with Indian commas', () => {
    expect(new Money('12345678.9').format()).toBe('₹1,23,45,678.90');
  });
  it('formats negatives with leading minus before symbol', () => {
    expect(new Money('-123456.78').format()).toBe('-₹1,23,456.78');
  });
  it('formats zero', () => {
    expect(Money.zero().format()).toBe('₹0.00');
  });
  it('respects custom decimals & symbol', () => {
    expect(new Money('1234').format(0, '$')).toBe('$1,234');
  });
});

describe('Money — paise round-trip', () => {
  it('fromPaise(1234567) is rupees 12345.67', () => {
    expect(Money.fromPaise(1234567).toString()).toBe('12345.67');
  });
  it('fromPaise accepts string integer', () => {
    expect(Money.fromPaise('100').toString()).toBe('1');
  });
  it('fromPaise accepts bigint', () => {
    expect(Money.fromPaise(100n).toString()).toBe('1');
  });
  it('fromPaise rejects fractional number', () => {
    expect(() => Money.fromPaise(1.5)).toThrow(TypeError);
  });
  it('fromPaise rejects non-integer string', () => {
    expect(() => Money.fromPaise('1.5')).toThrow(TypeError);
    expect(() => Money.fromPaise('abc')).toThrow(TypeError);
  });
  it('toPaise rounds to whole paise via banker’s rounding', () => {
    expect(new Money('12345.6789').toPaise()).toBe('1234568');
    expect(new Money('1.005').toPaise()).toBe('100');
  });
  it('toPaise round-trips with fromPaise', () => {
    const original = '99999999.99';
    expect(Money.fromPaise(new Money(original).toPaise()).toString()).toBe(original);
  });
});

describe('Money — serialization', () => {
  it('toJSON returns canonical string, never a number', () => {
    const m = new Money('99.99');
    expect(m.toJSON()).toBe('99.99');
    expect(JSON.stringify({ price: m })).toBe('{"price":"99.99"}');
  });
  it('toString is stable across equal-value constructors', () => {
    expect(new Money('10').toString()).toBe('10');
    expect(new Money('10.0').toString()).toBe('10');
    expect(new Money('010').toString()).toBe('10');
  });
});
