import { describe, it, expect } from 'vitest';

import { orderRequestSchema } from './orders.js';

const baseValidLimit = {
  brokerId: 'broker-1',
  clientOrderId: 'client-001',
  symbol: 'RELIANCE',
  side: 'BUY' as const,
  type: 'LIMIT' as const,
  quantity: '10',
  price: '2500.50',
  timeInForce: 'DAY' as const,
};

describe('orderRequestSchema', () => {
  it('accepts a valid LIMIT BUY order', () => {
    expect(() => orderRequestSchema.parse(baseValidLimit)).not.toThrow();
  });

  it('rejects LIMIT order without price', () => {
    const { price: _omit, ...rest } = baseValidLimit;
    void _omit;
    const result = orderRequestSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'price')).toBe(true);
    }
  });

  it('rejects MARKET order with a price', () => {
    const result = orderRequestSchema.safeParse({
      ...baseValidLimit,
      type: 'MARKET',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'price')).toBe(true);
    }
  });

  it('rejects negative quantity', () => {
    const result = orderRequestSchema.safeParse({ ...baseValidLimit, quantity: '-1' });
    expect(result.success).toBe(false);
  });

  it('rejects zero quantity', () => {
    const result = orderRequestSchema.safeParse({ ...baseValidLimit, quantity: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects quantity as a JS number', () => {
    const result = orderRequestSchema.safeParse({ ...baseValidLimit, quantity: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown side', () => {
    const result = orderRequestSchema.safeParse({ ...baseValidLimit, side: 'HOLD' });
    expect(result.success).toBe(false);
  });

  it('defaults timeInForce to DAY when omitted', () => {
    const { timeInForce: _omit, ...rest } = baseValidLimit;
    void _omit;
    const parsed = orderRequestSchema.parse(rest);
    expect(parsed.timeInForce).toBe('DAY');
  });

  it('rejects symbol with lowercase / spaces', () => {
    const result = orderRequestSchema.safeParse({ ...baseValidLimit, symbol: 'reliance ltd' });
    expect(result.success).toBe(false);
  });
});
