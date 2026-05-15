import { describe, it, expect } from 'vitest';

import { Money } from '@lp/utils';

import { ChargesService } from './charges.service.js';

const svc = new ChargesService();
const at = new Date('2025-01-15T05:30:00Z');

describe('ChargesService.computeForFill', () => {
  it('produces an STT line on equity intraday SELL', () => {
    const lines = svc.computeForFill({
      tradeId: '01HABCDEFGHJKMNPQRSTVWXYZ0',
      side: 'SELL',
      quantity: '100',
      price: '500',
      executedAt: at,
      segment: 'EQ_INTRADAY',
    });
    const stt = lines.find((l) => l.type === 'STT');
    expect(stt).toBeDefined();
    // 100 * 500 * 0.00025 = 12.5
    expect(stt?.amount).toBe('12.5');
  });

  it('skips STT on equity intraday BUY', () => {
    const lines = svc.computeForFill({
      tradeId: 't1',
      side: 'BUY',
      quantity: '100',
      price: '500',
      executedAt: at,
      segment: 'EQ_INTRADAY',
    });
    expect(lines.find((l) => l.type === 'STT')).toBeUndefined();
  });

  it('caps brokerage at the per-order ceiling', () => {
    // Turnover = 1_000_000 * 1000 = 1B. brokerageRate=0.0003 → 300_000.
    // brokerageMax=20 should cap.
    const lines = svc.computeForFill({
      tradeId: 't1',
      side: 'BUY',
      quantity: '1000000',
      price: '1000',
      executedAt: at,
      segment: 'EQ_INTRADAY',
    });
    const brokerage = lines.find((l) => l.type === 'BROKERAGE');
    expect(brokerage?.amount).toBe('20');
  });

  it('charges on both sides for equity delivery (STT both buy & sell)', () => {
    const buy = svc.computeForFill({
      tradeId: 't1',
      side: 'BUY',
      quantity: '100',
      price: '1000',
      executedAt: at,
      segment: 'EQ_DELIVERY',
    });
    const sell = svc.computeForFill({
      tradeId: 't2',
      side: 'SELL',
      quantity: '100',
      price: '1000',
      executedAt: at,
      segment: 'EQ_DELIVERY',
    });
    expect(buy.find((l) => l.type === 'STT')?.amount).toBe('100');
    expect(sell.find((l) => l.type === 'STT')?.amount).toBe('100');
  });

  it('applies stamp duty only on BUY side', () => {
    const buy = svc.computeForFill({
      tradeId: 't1',
      side: 'BUY',
      quantity: '100',
      price: '1000',
      executedAt: at,
      segment: 'EQ_DELIVERY',
    });
    const sell = svc.computeForFill({
      tradeId: 't2',
      side: 'SELL',
      quantity: '100',
      price: '1000',
      executedAt: at,
      segment: 'EQ_DELIVERY',
    });
    expect(buy.find((l) => l.type === 'STAMP_DUTY')).toBeDefined();
    expect(sell.find((l) => l.type === 'STAMP_DUTY')).toBeUndefined();
  });

  it('applies 18% GST on (brokerage + exchange + sebi)', () => {
    const lines = svc.computeForFill({
      tradeId: 't1',
      side: 'BUY',
      quantity: '100',
      price: '1000',
      executedAt: at,
      segment: 'FUT',
    });
    const brokerage = new Money(lines.find((l) => l.type === 'BROKERAGE')?.amount ?? '0');
    const exchange = new Money(lines.find((l) => l.type === 'EXCHANGE_FEE')?.amount ?? '0');
    const sebi = new Money(lines.find((l) => l.type === 'SEBI_FEE')?.amount ?? '0');
    const expectedGst = brokerage.add(exchange).add(sebi).mul('0.18').round(2);
    const actualGst = new Money(lines.find((l) => l.type === 'GST')?.amount ?? '0');
    expect(actualGst.eq(expectedGst)).toBe(true);
  });
});
