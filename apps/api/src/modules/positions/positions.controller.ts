import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';

import { ErrorCode } from '@lp/constants';
import { Money } from '@lp/utils/money';
import { positionSnapshotRequestSchema, type PositionSnapshotRequest } from '@lp/validators';

import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator.js';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { REDIS_CLIENT, REDIS_PUBLISHER } from '../../infrastructure/redis.module.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { HmacGuard } from '../hmac/hmac.guard.js';

import type { OpenPositionMark, PositionSnapshotEvent } from '@lp/types';
import type { FastifyRequest } from 'fastify';

const LP_EVENTS_CHANNEL = 'lp.events';
/** Redis key for the latest snapshot, so a dashboard load isn't blank. */
const snapshotKey = (brokerId: string): string => `lp:positions:${brokerId}`;
/** Marks are ephemeral — expire shortly after the upstream stops streaming. */
const SNAPSHOT_TTL_SECONDS = 30;

interface CachedSnapshot {
  readonly marks: readonly OpenPositionMark[];
  readonly totalUnrealizedPnl: string;
  readonly ts: number;
}

/**
 * Live open-position blotter. The upstream broker (dios) HMAC-POSTs a full
 * mark-to-market snapshot of its open A-Book positions on every tick; we
 * republish it on the broker's websocket room AND cache the latest so the
 * portal renders instantly on load. Nothing is persisted to Postgres — these
 * are transient marks, not the immutable trade ledger (which is fed separately
 * by the open/close orders).
 */
@ApiTags('broker/positions')
@Controller('api/v1/broker/positions')
export class PositionsController {
  constructor(
    @Inject(REDIS_PUBLISHER) private readonly publisher: Redis,
    @Inject(REDIS_CLIENT) private readonly cache: Redis,
  ) {}

  @Post('mark-to-market')
  @ApiSecurity('hmac')
  @UseGuards(HmacGuard)
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(positionSnapshotRequestSchema))
  async mark(
    @Body() dto: PositionSnapshotRequest,
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

    const total = dto.marks.reduce((acc, m) => acc.add(m.unrealizedPnl), Money.zero());
    const totalUnrealizedPnl = total.toString();

    const event: PositionSnapshotEvent = {
      type: 'position.snapshot',
      brokerId: dto.brokerId,
      marks: dto.marks,
      totalUnrealizedPnl,
      ts: dto.ts,
    };

    const cached: CachedSnapshot = {
      marks: dto.marks,
      totalUnrealizedPnl,
      ts: dto.ts,
    };
    await Promise.all([
      this.publisher.publish(LP_EVENTS_CHANNEL, JSON.stringify(event)),
      this.cache.set(snapshotKey(dto.brokerId), JSON.stringify(cached), 'EX', SNAPSHOT_TTL_SECONDS),
    ]);

    return { ok: true, count: dto.marks.length };
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  async list(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
  ): Promise<CachedSnapshot & { brokerId: string }> {
    const brokerId = this.scope(user, requested);
    const raw = await this.cache.get(snapshotKey(brokerId));
    if (!raw) {
      return { brokerId, marks: [], totalUnrealizedPnl: '0', ts: 0 };
    }
    const parsed = JSON.parse(raw) as CachedSnapshot;
    return { brokerId, ...parsed };
  }

  /** Broker users are pinned to their own broker; LP roles must name one. */
  private scope(user: CurrentUserPayload | null, requested?: string): string {
    if (!user) {
      throw new DomainException(ErrorCode.AUTH_FORBIDDEN, 'No user', HttpStatus.FORBIDDEN);
    }
    if (user.role === 'broker_user') {
      if (!user.brokerId) {
        throw new DomainException(
          ErrorCode.AUTH_FORBIDDEN,
          'User missing brokerId',
          HttpStatus.FORBIDDEN,
        );
      }
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
