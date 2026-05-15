import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '@lp/constants';
import { orderRequestSchema, type OrderRequest } from '@lp/validators';

import { DomainException } from '../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { HmacGuard } from '../hmac/hmac.guard.js';

import { OrdersRepository } from './orders.repository.js';

import type { Queue } from 'bullmq';
import type { FastifyRequest } from 'fastify';

export const ORDERS_QUEUE = 'orders';
export interface OrderJobData {
  orderId: string;
  brokerId: string;
}

@ApiTags('broker/orders')
@ApiSecurity('hmac')
@UseGuards(HmacGuard)
@Controller('api/v1/broker/orders')
export class OrdersController {
  constructor(
    private readonly repo: OrdersRepository,
    @InjectQueue(ORDERS_QUEUE) private readonly queue: Queue<OrderJobData>,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(orderRequestSchema))
  async place(
    @Body() dto: OrderRequest,
    @Req() req: FastifyRequest,
  ): Promise<{ orderId: string; status: 'ACCEPTED' }> {
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

    const order = await this.repo.insert({
      clientOrderId: dto.clientOrderId,
      brokerId: dto.brokerId,
      symbol: dto.symbol,
      side: dto.side as 'BUY' | 'SELL',
      type: dto.type as 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT',
      quantity: dto.quantity,
      price: dto.price ?? null,
      timeInForce: dto.timeInForce as 'DAY' | 'IOC' | 'FOK' | 'GTC',
    });

    await this.queue.add(
      'process',
      { orderId: order.orderId, brokerId: order.brokerId },
      { removeOnComplete: 1000, removeOnFail: 5000 },
    );

    await this.audit.record({
      actorType: 'broker_api',
      actorId: broker.apiKeyId,
      action: 'order.placed',
      resourceType: 'order',
      resourceId: order.orderId,
      outcome: 'success',
      metadata: { symbol: dto.symbol, side: dto.side, qty: dto.quantity },
      ipAddress: req.ip,
    });

    return { orderId: order.orderId, status: 'ACCEPTED' };
  }
}
