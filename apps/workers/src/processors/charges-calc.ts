/**
 * Pure charge calculator for the worker. Mirrors apps/api/src/modules/charges/charges.service.ts
 * without the Nest `@Injectable` decorator so it can run in the worker process.
 *
 * Both implementations share the same rate-table source (@lp/constants), so
 * keeping them in sync is a matter of identical inputs producing identical
 * outputs — verified by the API-side unit test suite (charges.service.spec.ts).
 *
 * If/when the charge-computation logic gets richer (per-broker overrides,
 * fee-discount tiers, etc.), promote this into @lp/core and import from
 * both apps/api and apps/workers.
 */
import { getActiveRate, type ProductSegment } from '@lp/constants';
import { Money } from '@lp/utils/money';

import type { ChargeType } from '@lp/types';

export interface FillForCharges {
  readonly tradeId: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: string;
  readonly price: string;
  readonly executedAt: Date;
  readonly segment: ProductSegment;
}

export interface ChargeLine {
  readonly tradeId: string;
  readonly type: ChargeType;
  readonly amount: string;
  readonly description: string;
}

export function computeChargesForFill(fill: FillForCharges): ChargeLine[] {
  const rate = getActiveRate(fill.segment, fill.executedAt);
  const turnover = new Money(fill.quantity).mul(fill.price);

  const brokerageRaw = turnover.mul(rate.brokerageRate);
  const brokerage = clamp(brokerageRaw, new Money(rate.brokerageMin), new Money(rate.brokerageMax));

  const stt = fill.side === 'BUY' ? turnover.mul(rate.sttBuyRate) : turnover.mul(rate.sttSellRate);

  const exchangeFee = turnover.mul(rate.exchangeFeeRate);
  const sebiFee = turnover.mul(rate.sebiFeeRate);
  const stamp = fill.side === 'BUY' ? turnover.mul(rate.stampDutyBuyRate) : Money.zero();
  const gstBase = brokerage.add(exchangeFee).add(sebiFee);
  const gst = gstBase.mul(rate.gstRate);

  const lines: ChargeLine[] = [];
  if (!brokerage.isZero()) {
    lines.push(line(fill.tradeId, 'BROKERAGE', brokerage, 'Brokerage'));
  }
  if (!stt.isZero()) {
    lines.push(line(fill.tradeId, 'STT', stt, 'Securities Transaction Tax'));
  }
  if (!exchangeFee.isZero()) {
    lines.push(line(fill.tradeId, 'EXCHANGE_FEE', exchangeFee, 'Exchange transaction charge'));
  }
  if (!sebiFee.isZero()) {
    lines.push(line(fill.tradeId, 'SEBI_FEE', sebiFee, 'SEBI turnover fee'));
  }
  if (!stamp.isZero()) {
    lines.push(line(fill.tradeId, 'STAMP_DUTY', stamp, 'Stamp duty'));
  }
  if (!gst.isZero()) {
    lines.push(line(fill.tradeId, 'GST', gst, 'GST on (brokerage + exchange + SEBI)'));
  }
  return lines;
}

function clamp(value: Money, min: Money, max: Money): Money {
  if (value.lt(min)) {
    return min;
  }
  if (max.gt(Money.zero()) && value.gt(max)) {
    return max;
  }
  return value;
}

function line(tradeId: string, type: ChargeType, amount: Money, description: string): ChargeLine {
  return { tradeId, type, amount: amount.round(2).toString(), description };
}
