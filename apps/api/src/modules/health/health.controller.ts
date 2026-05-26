import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Redis } from 'ioredis';

import { PG_POOL } from '../../database/connection.js';
import { REDIS_CLIENT } from '../../infrastructure/redis.module.js';

import type pg from 'pg';

interface HealthResponse {
  status: 'ok' | 'degraded';
  postgres: 'up' | 'down';
  redis: 'up' | 'down';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

@ApiTags('health')
// Liveness / readiness checks must not be rate-limited — orchestrators
// (k8s, docker swarm, your monitoring) poll this frequently and a 429
// here causes them to mark the API down and start restarting pods.
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [pg, redis] = await Promise.all([this.checkPg(), this.checkRedis()]);
    return {
      status: pg === 'up' && redis === 'up' ? 'ok' : 'degraded',
      postgres: pg,
      redis,
      version: process.env.npm_package_version ?? '0.0.0',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkPg(): Promise<'up' | 'down'> {
    try {
      await this.pool.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
