import { Body, Controller, Get, HttpStatus, Inject, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { z } from 'zod';

import { ErrorCode } from '@lp/constants';
import { ulid } from '@lp/utils';

import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator.js';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { DRIZZLE_DB, type Db } from '../../database/connection.js';
import { REDIS_CLIENT } from '../../infrastructure/redis.module.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { BrokersRepository } from '../brokers/brokers.repository.js';
import { LedgerRepository } from '../ledger/ledger.repository.js';
import { OrdersRepository } from '../orders/orders.repository.js';

import type { OrderRow } from '../orders/schema/order.schema.js';

/** Broker-submitted deposit (funding) request. Manual flow for now — no live
 *  payment gateway; the broker picks a method and the LP admin approves. */
const createDepositSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'amount must be a positive decimal'),
  method: z.enum(['card', 'bank', 'upi', 'crypto', 'manual']).default('manual'),
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

interface DepositRequestRow {
  request_id: string;
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  note: string | null;
  status: string;
  created_at: Date | string;
  decided_at: Date | string | null;
}

/**
 * Read-only broker-portal endpoints (JWT, broker-scoped). Powers the broker
 * dashboard pages: account, wallet balance, ledger/transactions, orders.
 * Trades live in TradesController; charges hang off trade detail.
 */
@ApiTags('broker/account')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/v1/broker')
export class BrokerPortalController {
  constructor(
    private readonly brokers: BrokersRepository,
    private readonly ledger: LedgerRepository,
    private readonly orders: OrdersRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(DRIZZLE_DB) private readonly db: Db,
  ) {}

  private static readonly rows = <T>(r: unknown): T[] => (r as { rows?: T[] }).rows ?? [];

  private static mapDeposit(r: DepositRequestRow) {
    const iso = (v: Date | string | null) =>
      v == null ? null : v instanceof Date ? v.toISOString() : String(v);
    return {
      requestId: r.request_id,
      amount: r.amount,
      currency: r.currency,
      method: r.method,
      reference: r.reference,
      note: r.note,
      status: r.status,
      createdAt: iso(r.created_at) as string,
      decidedAt: iso(r.decided_at),
    };
  }

  /** Submit a deposit (funding) request — lands as PENDING for admin review. */
  @Post('wallet/deposit-requests')
  @UsePipes(new ZodValidationPipe(createDepositSchema))
  async createDepositRequest(
    @CurrentUser() user: CurrentUserPayload | null,
    @Body() body: z.infer<typeof createDepositSchema>,
  ) {
    const brokerId = this.scope(user);
    const walletsOf = await this.ledger.findWalletsByBroker(brokerId);
    const currency = walletsOf[0]?.currency ?? 'USD';
    const requestId = ulid();
    await this.db.execute(sql`
      INSERT INTO ledger.deposit_requests
        (request_id, broker_id, amount, currency, method, reference, note)
      VALUES
        (${requestId}, ${brokerId}, ${body.amount}, ${currency}, ${body.method},
         ${body.reference ?? null}, ${body.note ?? null})
    `);
    const found = BrokerPortalController.rows<DepositRequestRow>(
      await this.db.execute(sql`
        SELECT request_id, amount::text AS amount, currency, method, reference, note,
               status, created_at, decided_at
        FROM ledger.deposit_requests WHERE request_id = ${requestId} LIMIT 1`),
    );
    const created = found[0];
    if (!created) {
      throw new DomainException(
        ErrorCode.INTERNAL_ERROR,
        'Deposit request not persisted',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return BrokerPortalController.mapDeposit(created);
  }

  /** A broker's own deposit requests (newest first). */
  @Get('wallet/deposit-requests')
  async listDepositRequests(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
  ) {
    const brokerId = this.scope(user, requested);
    const raw = BrokerPortalController.rows<DepositRequestRow>(
      await this.db.execute(sql`
        SELECT request_id, amount::text AS amount, currency, method, reference, note,
               status, created_at, decided_at
        FROM ledger.deposit_requests
        WHERE broker_id = ${brokerId}
        ORDER BY id DESC
        LIMIT 100`),
    );
    return { items: raw.map((r) => BrokerPortalController.mapDeposit(r)) };
  }

  /**
   * Latest mark-to-market snapshot of open positions (cached in Redis by the
   * upstream broker's push, 30s TTL). HTTP-pollable fallback for the live
   * blotter so it works even when the websocket can't connect.
   */
  @Get('positions')
  async positions(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
  ): Promise<{ positions: unknown[]; totalPnl: string; ts: string }> {
    const brokerId = this.scope(user, requested);
    const empty = { positions: [], totalPnl: '0', ts: new Date().toISOString() };
    const raw = await this.redis.get(`positions:${brokerId}`).catch(() => null);
    if (!raw) {
      return empty;
    }
    try {
      const snap = JSON.parse(raw) as {
        positions?: unknown[];
        totalPnl?: string;
        ts?: string;
      };
      return {
        positions: snap.positions ?? [],
        totalPnl: snap.totalPnl ?? '0',
        ts: snap.ts ?? empty.ts,
      };
    } catch {
      return empty;
    }
  }

  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload | null) {
    const brokerId = this.scope(user);
    const broker = await this.brokers.findByBrokerId(brokerId);
    if (!broker) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    return {
      broker: {
        brokerId: broker.brokerId,
        displayName: broker.displayName,
        contactEmail: broker.contactEmail,
        status: broker.status,
        createdAt: broker.createdAt,
      },
      user: user ? { email: user.email, role: user.role } : null,
    };
  }

  @Get('wallet')
  async wallet(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
  ) {
    const brokerId = this.scope(user, requested);
    const wallets = await this.ledger.findWalletsByBroker(brokerId);
    const withBalance = await Promise.all(
      wallets.map(async (w) => ({
        walletId: w.walletId,
        currency: w.currency,
        balance: await this.ledger.getBalance(w.walletId),
      })),
    );
    return { wallets: withBalance };
  }

  @Get('ledger')
  async ledgerEntries(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
    @Query('limit') limit?: string,
  ) {
    const brokerId = this.scope(user, requested);
    const items = await this.ledger.findEntriesByBroker(brokerId, Number(limit) || 100);
    return { items };
  }

  @Get('orders')
  async ordersList(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const brokerId = this.scope(user, requested);
    const items = await this.orders.findByBroker(brokerId, {
      limit: Number(limit) || 100,
      ...(status ? { status: status as OrderRow['status'] } : {}),
    });
    return { items };
  }

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
