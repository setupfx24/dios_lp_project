import { describe, it, expect } from 'vitest';

import { RiskService } from './risk.service.js';

const svc = new RiskService();

describe('RiskService.check', () => {
  it('passes a valid BUY within margin and position limit', () => {
    expect(() =>
      svc.check({
        brokerId: 'b1',
        symbol: 'X',
        side: 'BUY',
        quantity: '10',
        price: '100',
        walletBalance: '5000',
        positionLimit: '100',
        currentPosition: '0',
      }),
    ).not.toThrow();
  });

  it('rejects zero quantity', () => {
    expect(() =>
      svc.check({
        brokerId: 'b1',
        symbol: 'X',
        side: 'BUY',
        quantity: '0',
        price: '100',
        walletBalance: '1000',
        positionLimit: '100',
        currentPosition: '0',
      }),
    ).toThrow(/Quantity/);
  });

  it('rejects insufficient margin on BUY', () => {
    expect(() =>
      svc.check({
        brokerId: 'b1',
        symbol: 'X',
        side: 'BUY',
        quantity: '10',
        price: '100',
        walletBalance: '999',
        positionLimit: '100',
        currentPosition: '0',
      }),
    ).toThrow(/Insufficient margin/);
  });

  it('skips margin check for market orders (no price)', () => {
    expect(() =>
      svc.check({
        brokerId: 'b1',
        symbol: 'X',
        side: 'BUY',
        quantity: '10',
        walletBalance: '0',
        positionLimit: '100',
        currentPosition: '0',
      }),
    ).not.toThrow();
  });

  it('rejects when projected position exceeds limit', () => {
    expect(() =>
      svc.check({
        brokerId: 'b1',
        symbol: 'X',
        side: 'BUY',
        quantity: '50',
        price: '1',
        walletBalance: '10000',
        positionLimit: '100',
        currentPosition: '60',
      }),
    ).toThrow(/Position limit/);
  });

  it('allows SELL that reduces a long position', () => {
    expect(() =>
      svc.check({
        brokerId: 'b1',
        symbol: 'X',
        side: 'SELL',
        quantity: '50',
        price: '1',
        walletBalance: '0',
        positionLimit: '100',
        currentPosition: '60',
      }),
    ).not.toThrow();
  });
});
