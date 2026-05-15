import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode } from '@lp/constants';
import { Money } from '@lp/utils';

import { DomainException } from '../../common/exceptions/domain.exception.js';

export interface PreTradeCheckInput {
  brokerId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price?: string;
  /** Stringified decimal — wallet balance available right now. */
  walletBalance: string;
  /** Stringified decimal — broker's per-symbol position limit. */
  positionLimit: string;
  /** Stringified decimal — broker's current net position in this symbol. */
  currentPosition: string;
}

@Injectable()
export class RiskService {
  /**
   * Throws DomainException on failure; returns void on pass.
   * Pure function over inputs — easy to unit test.
   */
  check(input: PreTradeCheckInput): void {
    const qty = new Money(input.quantity);
    if (qty.isZero() || qty.isNegative()) {
      throw new DomainException(
        ErrorCode.ORDER_INVALID_QUANTITY,
        'Quantity must be > 0',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (input.price !== undefined) {
      const required = qty.mul(input.price);
      const balance = new Money(input.walletBalance);
      if (input.side === 'BUY' && required.gt(balance)) {
        throw new DomainException(
          ErrorCode.RISK_INSUFFICIENT_MARGIN,
          `Insufficient margin: needed ${required.toString()}, have ${balance.toString()}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    const limit = new Money(input.positionLimit);
    const current = new Money(input.currentPosition);
    const projected = input.side === 'BUY' ? current.add(qty) : current.sub(qty);
    if (projected.abs().gt(limit)) {
      throw new DomainException(
        ErrorCode.RISK_POSITION_LIMIT_EXCEEDED,
        `Position limit exceeded: projected ${projected.toString()} > limit ${limit.toString()}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
