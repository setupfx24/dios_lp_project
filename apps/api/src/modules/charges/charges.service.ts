import { Injectable } from '@nestjs/common';

import { getActiveRate, type ProductSegment } from '@lp/constants';
import { Money } from '@lp/utils';

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

@Injectable()
export class ChargesService {
  /**
   * Pure function over a fill. Returns itemized Indian-tax charges.
   * Numbers are rounded to 2dp (paise) at emit time using banker's rounding.
   */
  computeForFill(fill: FillForCharges): ChargeLine[] {
    const rate = getActiveRate(fill.segment, fill.executedAt);
    const turnover = new Money(fill.quantity).mul(fill.price);

    const brokerageRaw = turnover.mul(rate.brokerageRate);
    const brokerage = clamp(
      brokerageRaw,
      new Money(rate.brokerageMin),
      new Money(rate.brokerageMax),
    );

    const stt =
      fill.side === 'BUY' ? turnover.mul(rate.sttBuyRate) : turnover.mul(rate.sttSellRate);

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

  totalFor(lines: readonly ChargeLine[]): Money {
    return lines.reduce<Money>((acc, l) => acc.add(l.amount), Money.zero());
  }
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
