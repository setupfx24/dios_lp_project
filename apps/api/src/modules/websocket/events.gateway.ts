import { Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as argon2 from 'argon2';
import { Redis } from 'ioredis';

import { verify as verifyHmac } from '@lp/utils';

import { parseCorsOrigins } from '../../config/env.schema.js';
import { REDIS_SUBSCRIBER } from '../../infrastructure/redis.module.js';
import { AuthService, type JwtPayload } from '../auth/auth.service.js';
import { BrokersRepository } from '../brokers/brokers.repository.js';

import type { DomainEvent } from '@lp/types';
import type { Server, Socket } from 'socket.io';

const REDIS_CHANNEL = 'lp.events';

// Module-load-time origin list: `@WebSocketGateway` decorator is evaluated
// before DI is wired, so we cannot call ConfigService here. Node has already
// applied `--env-file=.env` by the time this file is imported, so reading
// process.env mirrors what envSchema validated at bootstrap.
const ALLOWED_WS_ORIGINS = parseCorsOrigins(process.env.CORS_ORIGINS);

function wsCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  // Non-browser clients (e.g. DIOS service-to-service) send no Origin header;
  // their auth is HMAC-gated below. CORS only protects browser callers.
  if (!origin) {
    callback(null, true);
    return;
  }
  if (ALLOWED_WS_ORIGINS.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`WS CORS denied: ${origin}`), false);
}

/**
 * Trade event stream.
 *
 * Auth path 1 — JWT (interactive dashboard sockets):
 *   socket.handshake.auth.token = '<jwt>'  OR  cookie 'lp_access=<jwt>'
 *
 * Auth path 2 — HMAC (service-to-service, e.g. DIOS):
 *   socket.handshake.headers['x-api-key']   = 'prefix.secret'
 *   socket.handshake.headers['x-timestamp'] = '<epoch-ms>'
 *   socket.handshake.headers['x-signature'] = hex(HMAC-SHA256(
 *     secret,
 *     `${timestamp}\nWS /ws\n`
 *   ))
 *
 * HMAC payload is `${ts}\nWS /ws\n` (empty body line) — same separator
 * convention as the REST HmacGuard so a broker only needs one signing
 * primitive in their codebase.
 */
@WebSocketGateway({
  cors: { origin: wsCorsOrigin, credentials: true },
  path: '/ws',
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly brokers: BrokersRepository,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscriber.subscribe(REDIS_CHANNEL);
    this.subscriber.on('message', (channel, payload) => {
      if (channel !== REDIS_CHANNEL) {
        return;
      }
      try {
        const event = JSON.parse(payload) as DomainEvent;
        const room = `broker:${event.brokerId}`;
        this.server.to(room).emit(event.type, event);
      } catch (err) {
        this.logger.warn({ err }, 'Failed to dispatch ws event');
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.unsubscribe(REDIS_CHANNEL);
  }

  async handleConnection(socket: Socket): Promise<void> {
    // Try HMAC headers first (service-to-service). Fall back to JWT (dashboard).
    const hmacBroker = await this.tryHmacAuth(socket);
    if (hmacBroker) {
      await socket.join(`broker:${hmacBroker}`);
      this.logger.log(`WS connect (HMAC) broker=${hmacBroker} sid=${socket.id}`);
      return;
    }

    const token = this.extractToken(socket);
    if (!token) {
      this.logger.warn(`WS rejected: no credentials (sid=${socket.id})`);
      socket.disconnect(true);
      return;
    }
    let payload: JwtPayload;
    try {
      payload = await this.auth.verify(token);
    } catch {
      this.logger.warn(`WS rejected: bad JWT (sid=${socket.id})`);
      socket.disconnect(true);
      return;
    }

    if (payload.brokerId) {
      await socket.join(`broker:${payload.brokerId}`);
    }
    if (payload.role !== 'broker_user') {
      // LP roles can subscribe to a chosen broker via a 'subscribe' event.
      socket.on('subscribe', async (msg: { brokerId?: string }) => {
        if (typeof msg.brokerId === 'string') {
          await socket.join(`broker:${msg.brokerId}`);
        }
      });
    }
    this.logger.log(
      `WS connect (JWT) user=${payload.sub} role=${payload.role} broker=${payload.brokerId ?? '-'}`,
    );
  }

  handleDisconnect(socket: Socket): void {
    this.logger.debug(`Socket disconnected: ${socket.id}`);
  }

  /**
   * Returns the broker_id on successful HMAC auth, or null if HMAC headers
   * weren't supplied. Throws nothing; auth failures are logged and surfaced
   * as `null` so the JWT path can be tried next (only the absence of headers
   * means "not HMAC"; a *present but invalid* HMAC closes the socket).
   */
  private async tryHmacAuth(socket: Socket): Promise<string | null> {
    const headers = socket.handshake.headers;
    const apiKey = headers['x-api-key'];
    const timestamp = headers['x-timestamp'];
    const signature = headers['x-signature'];
    if (
      typeof apiKey !== 'string' ||
      typeof timestamp !== 'string' ||
      typeof signature !== 'string'
    ) {
      return null;
    }

    const [prefix, secret] = apiKey.split('.');
    if (!prefix || !secret) {
      this.logger.warn(`WS HMAC rejected: malformed api key (sid=${socket.id})`);
      socket.disconnect(true);
      return null;
    }

    const found = await this.brokers.findByApiKeyPrefix(prefix);
    if (!found) {
      this.logger.warn(`WS HMAC rejected: unknown prefix ${prefix} (sid=${socket.id})`);
      socket.disconnect(true);
      return null;
    }
    const { broker, key } = found;

    if (broker.status !== 'active') {
      this.logger.warn(`WS HMAC rejected: broker ${broker.brokerId} not active`);
      socket.disconnect(true);
      return null;
    }

    const secretValid = await argon2.verify(key.secretHash, secret);
    if (!secretValid) {
      this.logger.warn(`WS HMAC rejected: bad secret for ${prefix} (sid=${socket.id})`);
      socket.disconnect(true);
      return null;
    }

    const result = verifyHmac(
      secret,
      {
        timestamp,
        body: '',
        requestLine: 'WS /ws',
      },
      signature,
    );
    if (!result.valid) {
      this.logger.warn(`WS HMAC rejected: ${result.reason} for ${prefix} (sid=${socket.id})`);
      socket.disconnect(true);
      return null;
    }

    return broker.brokerId;
  }

  private extractToken(socket: Socket): string | null {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const header = auth?.token;
    if (typeof header === 'string') {
      return header;
    }
    const cookieToken = socket.handshake.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('lp_access='))
      ?.slice('lp_access='.length);
    return cookieToken ?? null;
  }
}
