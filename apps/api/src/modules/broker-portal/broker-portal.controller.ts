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

/** Broker-submitted deposit/withdrawal request. Manual flow for now — no live
 *  payment gateway; the broker picks a method and the LP admin approves. */
const createDepositSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'amount must be a positive decimal'),
  method: z.enum(['card', 'bank', 'upi', 'crypto', 'manual']).default('manual'),
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Locked floor — only the wallet balance ABOVE this can be withdrawn. */
const WITHDRAW_FLOOR = Number(process.env.WITHDRAW_FLOOR ?? '5000');

interface DepositRequestRow {
  request_id: string;
  kind: string;
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
      kind: r.kind,
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
        SELECT request_id, kind, amount::text AS amount, currency, method, reference, note,
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
        SELECT request_id, kind, amount::text AS amount, currency, method, reference, note,
               status, created_at, decided_at
        FROM ledger.deposit_requests
        WHERE broker_id = ${brokerId}
        ORDER BY id DESC
        LIMIT 100`),
    );
    return { items: raw.map((r) => BrokerPortalController.mapDeposit(r)) };
  }

  /** How much the broker can withdraw right now (balance above the floor). */
  @Get('wallet/withdrawable')
  async withdrawable(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
  ): Promise<{ balance: string; floor: string; withdrawable: string; currency: string }> {
    const brokerId = this.scope(user, requested);
    const walletsOf = await this.ledger.findWalletsByBroker(brokerId);
    const currency = walletsOf[0]?.currency ?? 'USD';
    let balance = 0;
    for (const w of walletsOf) {
      balance += Number(await this.ledger.getBalance(w.walletId));
    }
    const avail = Math.max(0, balance - WITHDRAW_FLOOR);
    return {
      balance: balance.toFixed(2),
      floor: WITHDRAW_FLOOR.toFixed(2),
      withdrawable: avail.toFixed(2),
      currency,
    };
  }

  /**
   * Submit a withdrawal request — capped at the balance ABOVE the locked floor
   * (only profit over $5000 can be pulled out). Lands as PENDING for admin
   * review; approval DEBITs the wallet.
   */
  @Post('wallet/withdrawal-requests')
  @UsePipes(new ZodValidationPipe(createDepositSchema))
  async createWithdrawalRequest(
    @CurrentUser() user: CurrentUserPayload | null,
    @Body() body: z.infer<typeof createDepositSchema>,
  ) {
    const brokerId = this.scope(user);
    const walletsOf = await this.ledger.findWalletsByBroker(brokerId);
    const currency = walletsOf[0]?.currency ?? 'USD';
    let balance = 0;
    for (const w of walletsOf) {
      balance += Number(await this.ledger.getBalance(w.walletId));
    }
    const avail = Math.max(0, balance - WITHDRAW_FLOOR);
    const amount = Number(body.amount);
    if (amount > avail + 1e-9) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Only ${avail.toFixed(2)} ${currency} is withdrawable (balance above the ${WITHDRAW_FLOOR} floor).`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const requestId = ulid();
    await this.db.execute(sql`
      INSERT INTO ledger.deposit_requests
        (request_id, kind, broker_id, amount, currency, method, reference, note)
      VALUES
        (${requestId}, 'withdrawal', ${brokerId}, ${body.amount}, ${currency}, ${body.method},
         ${body.reference ?? null}, ${body.note ?? null})
    `);
    const found = BrokerPortalController.rows<DepositRequestRow>(
      await this.db.execute(sql`
        SELECT request_id, kind, amount::text AS amount, currency, method, reference, note,
               status, created_at, decided_at
        FROM ledger.deposit_requests WHERE request_id = ${requestId} LIMIT 1`),
    );
    const created = found[0];
    if (!created) {
      throw new DomainException(
        ErrorCode.INTERNAL_ERROR,
        'Withdrawal request not persisted',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return BrokerPortalController.mapDeposit(created);
  }

  /**
   * Commission (brokerage) history — the per-lot fee charged on each A-Book
   * position the broker opened, with the originating trade context + grand
   * total. Pagination is done client-side.
   */
  @Get('commissions')
  async commissions(
    @CurrentUser() user: CurrentUserPayload | null,
    @Query('brokerId') requested?: string,
  ) {
    const brokerId = this.scope(user, requested);
    const raw = BrokerPortalController.rows<{
      amount: string;
      description: string;
      created_at: Date | string;
      trade_id: string;
      symbol: string;
      side: string;
      quantity: string;
      client_user_label: string | null;
      client_user_id: string | null;
    }>(
      await this.db.execute(sql`
        SELECT c.amount::text AS amount, c.description, c.created_at,
               t.trade_id, t.symbol, t.side, t.quantity::text AS quantity,
               o.client_user_label, o.client_user_id
        FROM trading.charges c
        JOIN trading.trades t ON t.trade_id = c.trade_id
        LEFT JOIN trading.orders o ON o.order_id = t.order_id
        WHERE t.broker_id = ${brokerId} AND c.type = 'BROKERAGE'
        ORDER BY c.id DESC
        LIMIT 500`),
    );
    const totalRow = BrokerPortalController.rows<{ total: string }>(
      await this.db.execute(sql`
        SELECT COALESCE(SUM(c.amount), 0)::text AS total
        FROM trading.charges c
        JOIN trading.trades t ON t.trade_id = c.trade_id
        WHERE t.broker_id = ${brokerId} AND c.type = 'BROKERAGE'`),
    );
    return {
      total: totalRow[0]?.total ?? '0',
      items: raw.map((r) => ({
        amount: r.amount,
        description: r.description,
        createdAt:
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        tradeId: r.trade_id,
        symbol: r.symbol,
        side: r.side,
        quantity: r.quantity,
        user: r.client_user_label,
        userId: r.client_user_id,
      })),
    };
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
