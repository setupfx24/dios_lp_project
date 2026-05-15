import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import * as argon2 from 'argon2';

import { ErrorCode, type ErrorCodeValue } from '@lp/constants';
import { verify as verifyHmac } from '@lp/utils';

import { HmacRejectedException } from '../../common/exceptions/domain.exception.js';
import { AuditService } from '../audit/audit.service.js';
import { BrokersRepository } from '../brokers/brokers.repository.js';

import type { FastifyRequest } from 'fastify';

export interface AuthenticatedBroker {
  brokerId: string;
  apiKeyId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    broker?: AuthenticatedBroker;
  }
}

@Injectable()
export class HmacGuard implements CanActivate {
  constructor(
    private readonly brokers: BrokersRepository,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest & { rawBody?: string }>();

    const apiKey = req.headers['x-api-key'];
    const timestamp = req.headers['x-timestamp'];
    const signature = req.headers['x-signature'];

    if (
      typeof apiKey !== 'string' ||
      typeof timestamp !== 'string' ||
      typeof signature !== 'string'
    ) {
      throw await this.makeRejection(req, ErrorCode.HMAC_INVALID_SIGNATURE, 'Missing HMAC headers');
    }

    const [prefix, secret] = apiKey.split('.');
    if (!prefix || !secret) {
      throw await this.makeRejection(req, ErrorCode.HMAC_INVALID_SIGNATURE, 'Malformed API key');
    }

    const found = await this.brokers.findByApiKeyPrefix(prefix);
    if (!found) {
      throw await this.makeRejection(req, ErrorCode.HMAC_UNKNOWN_KEY, 'Unknown API key');
    }
    const { broker, key } = found;

    if (broker.status !== 'active') {
      throw await this.makeRejection(req, ErrorCode.HMAC_KEY_REVOKED, 'Broker not active');
    }

    const secretValid = await argon2.verify(key.secretHash, secret);
    if (!secretValid) {
      throw await this.makeRejection(req, ErrorCode.HMAC_INVALID_SIGNATURE, 'Bad secret');
    }

    const body =
      req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    const result = verifyHmac(
      secret,
      {
        timestamp,
        body,
        requestLine: `${req.method} ${req.url}`,
      },
      signature,
    );

    if (!result.valid) {
      const code: ErrorCodeValue =
        result.reason === 'STALE_TIMESTAMP' || result.reason === 'BAD_TIMESTAMP'
          ? ErrorCode.HMAC_TIMESTAMP_SKEW
          : ErrorCode.HMAC_INVALID_SIGNATURE;
      throw await this.makeRejection(req, code, result.reason);
    }

    req.broker = { brokerId: broker.brokerId, apiKeyId: key.apiKeyId };
    await this.brokers.touchApiKeyLastUsed(key.apiKeyId);
    return true;
  }

  private async makeRejection(
    req: FastifyRequest,
    code: ErrorCodeValue,
    reason: string,
  ): Promise<HmacRejectedException> {
    const apiKey = req.headers['x-api-key'];
    const actorId = typeof apiKey === 'string' ? (apiKey.split('.')[0] ?? 'unknown') : 'unknown';
    await this.audit.record({
      actorType: 'broker_api',
      actorId,
      action: 'hmac.reject',
      outcome: 'failure',
      metadata: { code, reason, path: req.url, method: req.method },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return new HmacRejectedException(code, reason);
  }
}
