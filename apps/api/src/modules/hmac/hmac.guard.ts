import { createHash } from 'node:crypto';

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import * as argon2 from 'argon2';


import { ErrorCode, type ErrorCodeValue } from '@lp/constants';
import { verify as verifyHmac } from '@lp/utils';

import { HmacRejectedException } from '../../common/exceptions/domain.exception.js';
import { REDIS_CLIENT } from '../../infrastructure/redis.module.js';
import { AuditService } from '../audit/audit.service.js';
import { BrokersRepository } from '../brokers/brokers.repository.js';

import type { FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';

export interface AuthenticatedBroker {
  brokerId: string;
  apiKeyId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    broker?: AuthenticatedBroker;
  }
}

// SECURITY: 30s caches mean admin actions (revoke key, suspend broker) take up
// to 30s to take effect on the HMAC hot path. Tighten if you need faster
// propagation, at the cost of more Argon2 / DB load per request.
const LOOKUP_CACHE_TTL_SECONDS = 30;
const VERIFY_CACHE_TTL_SECONDS = 30;
const LOOKUP_CACHE_PREFIX = 'hmac:lookup:';
const VERIFY_CACHE_PREFIX = 'hmac:verified:';

interface CachedAuthorization {
  brokerId: string;
  brokerStatus: string;
  apiKeyId: string;
  secretHash: string;
}

@Injectable()
export class HmacGuard implements CanActivate {
  constructor(
    private readonly brokers: BrokersRepository,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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

    const authz = await this.loadAuthorization(prefix);
    if (!authz) {
      throw await this.makeRejection(req, ErrorCode.HMAC_UNKNOWN_KEY, 'Unknown API key');
    }

    if (authz.brokerStatus !== 'active') {
      throw await this.makeRejection(req, ErrorCode.HMAC_KEY_REVOKED, 'Broker not active');
    }

    const verifyKey = this.verifyCacheKey(prefix, secret);
    const alreadyVerified = await this.redis.get(verifyKey);
    if (!alreadyVerified) {
      const secretValid = await argon2.verify(authz.secretHash, secret);
      if (!secretValid) {
        throw await this.makeRejection(req, ErrorCode.HMAC_INVALID_SIGNATURE, 'Bad secret');
      }
      await this.redis.set(verifyKey, '1', 'EX', VERIFY_CACHE_TTL_SECONDS);
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

    req.broker = { brokerId: authz.brokerId, apiKeyId: authz.apiKeyId };
    await this.brokers.touchApiKeyLastUsed(authz.apiKeyId);
    return true;
  }

  /**
   * Two-tier authorization lookup: Redis (30s TTL) → Postgres.
   * Returns only the fields the HMAC hot path actually needs so we can serialize
   * compactly and avoid leaking other columns into the cache.
   */
  private async loadAuthorization(prefix: string): Promise<CachedAuthorization | null> {
    const cacheKey = LOOKUP_CACHE_PREFIX + prefix;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as CachedAuthorization;
      } catch {
        // Fall through to DB on malformed cache entry.
      }
    }
    const row = await this.brokers.findByApiKeyPrefix(prefix);
    if (!row) return null;
    const authz: CachedAuthorization = {
      brokerId: row.broker.brokerId,
      brokerStatus: row.broker.status,
      apiKeyId: row.key.apiKeyId,
      secretHash: row.key.secretHash,
    };
    await this.redis.set(cacheKey, JSON.stringify(authz), 'EX', LOOKUP_CACHE_TTL_SECONDS);
    return authz;
  }

  /**
   * Verify-cache key never embeds the raw secret. SHA-256 of "prefix:secret" is
   * a fast, non-reversible token — knowing the Redis key requires already
   * knowing the secret, and Redis dumps don't leak credentials.
   */
  private verifyCacheKey(prefix: string, secret: string): string {
    const fingerprint = createHash('sha256').update(`${prefix}:${secret}`).digest('hex');
    return `${VERIFY_CACHE_PREFIX}${prefix}:${fingerprint}`;
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
