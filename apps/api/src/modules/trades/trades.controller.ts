import { Controller, Get, Param, Query, UseGuards, UsePipes } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '@lp/constants';
import { tradeListQuerySchema, type TradeListQuery } from '@lp/validators';

import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator.js';
import { DomainException, NotFoundException } from '../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { ChargesRepository } from '../charges/charges.repository.js';

import { TradesRepository, type TradeListItemRow } from './trades.repository.js';

import type { TradeRow } from './schema/trade.schema.js';
import type { ChargeRow } from '../charges/schema/charge.schema.js';

interface TradeWithChargesDto {
  trade: TradeRow;
  charges: readonly ChargeRow[];
}

@ApiTags('broker/trades')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/v1/broker/trades')
export class TradesController {
  constructor(
    private readonly trades: TradesRepository,
    private readonly charges: ChargesRepository,
  ) {}

  @Get()
  @UsePipes(new ZodValidationPipe(tradeListQuerySchema))
  async list(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query() query: TradeListQuery,
  ): Promise<{ items: TradeListItemRow[]; nextCursor: string | null }> {
    if (!user) {
      throw new DomainException(ErrorCode.AUTH_FORBIDDEN, 'No user', HttpStatus.FORBIDDEN);
    }
    const brokerId = this.brokerScope(user, query.brokerId);
    const items = await this.trades.findByBroker({ ...query, brokerId });
    const last = items[items.length - 1];
    const nextCursor = items.length === query.limit && last ? String(last.id - 1n) : null;
    return { items, nextCursor };
  }

  @Get(':tradeId')
  async detail(
    @CurrentUser() user: CurrentUserPayload | null,
    @Param('tradeId') tradeId: string,
  ): Promise<TradeWithChargesDto> {
    if (!user) {
      throw new DomainException(ErrorCode.AUTH_FORBIDDEN, 'No user', HttpStatus.FORBIDDEN);
    }
    const trade = await this.trades.findById(tradeId);
    if (!trade) {
      throw new NotFoundException('Trade', tradeId);
    }
    if (user.role === 'broker_user' && trade.brokerId !== user.brokerId) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Cross-broker access denied',
        HttpStatus.FORBIDDEN,
      );
    }
    const charges = await this.charges.findByTrade(tradeId);
    return { trade, charges };
  }

  private brokerScope(user: CurrentUserPayload, requested?: string): string {
    if (user.role === 'broker_user') {
      if (!user.brokerId) {
        throw new DomainException(
          ErrorCode.AUTH_FORBIDDEN,
          'User missing brokerId',
          HttpStatus.FORBIDDEN,
        );
      }
      // Broker users always see only their own broker's trades.
      return user.brokerId;
    }
    if (!requested) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'brokerId is required for LP roles',
        HttpStatus.BAD_REQUEST,
      );
    }
    return requested;
  }
}
