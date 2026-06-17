import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';
import { z } from 'zod';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { REDIS_CLIENT, REDIS_PUBLISHER } from '../../infrastructure/redis.module.js';
import { HmacGuard } from '../hmac/hmac.guard.js';

import type { FastifyRequest } from 'fastify';

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/, 'expected a decimal string');

const markToMarketSchema = z.object({
  brokerId: z.string().min(1),
  positions: z
    .array(
      z.object({
        tradeId: z.string(),
        symbol: z.string(),
        side: z.enum(['BUY', 'SELL']),
        quantity: decimal,
        openPrice: decimal,
        currentPrice: decimal,
        floatingPnl: decimal,
      }),
    )
    .max(2000),
  totalPnl: decimal,
  timestamp: z.string().optional(),
});

type MarkToMarketDto = z.infer<typeof markToMarketSchema>;

/**
 * Live mark-to-market feed for the broker's open A-Book positions.
 *
 * The upstream broker (dios) pushes a full snapshot every ~2s, HMAC-signed
 * exactly like an order POST. We cache the latest snapshot in Redis (30s TTL)
 * for instant dashboard load, and rebroadcast it on the broker's websocket
 * room via the shared `lp.events` channel so the live blotter ticks. This only
 * RECEIVES prices — it never mutates trades/ledger (append-only invariants
 * untouched).
 */
@ApiTags('broker/positions')
@ApiSecurity('hmac')
@UseGuards(HmacGuard)
@Controller('api/v1/broker/positions')
export class PositionsController {
  constructor(
    @Inject(REDIS_PUBLISHER) private readonly publisher: Redis,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Post('mark-to-market')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(markToMarketSchema))
  async markToMarket(
    @Body() dto: MarkToMarketDto,
    @Req() req: FastifyRequest,
  ): Promise<{ ok: true; count: number }> {
    const broker = req.broker;
    if (!broker) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'No authenticated broker on request',
        HttpStatus.FORBIDDEN,
      );
    }
    if (broker.brokerId !== dto.brokerId) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'brokerId mismatch with API key',
        HttpStatus.FORBIDDEN,
      );
    }

    const snapshot = {
      type: 'positions.snapshot',
      brokerId: dto.brokerId,
      positions: dto.positions,
      totalPnl: dto.totalPnl,
      ts: dto.timestamp ?? new Date().toISOString(),
    };

    await this.redis.set(`positions:${dto.brokerId}`, JSON.stringify(snapshot), 'EX', 30);
    await this.publisher.publish('lp.events', JSON.stringify(snapshot));

    return { ok: true, count: dto.positions.length };
  }
}
