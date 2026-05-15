import { Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Redis } from 'ioredis';

import { REDIS_SUBSCRIBER } from '../../infrastructure/redis.module.js';
import { AuthService, type JwtPayload } from '../auth/auth.service.js';

import type { DomainEvent } from '@lp/types';
import type { Server, Socket } from 'socket.io';

const REDIS_CHANNEL = 'lp.events';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
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
    const token = this.extractToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }
    let payload: JwtPayload;
    try {
      payload = await this.auth.verify(token);
    } catch {
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
  }

  handleDisconnect(socket: Socket): void {
    this.logger.debug(`Socket disconnected: ${socket.id}`);
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
