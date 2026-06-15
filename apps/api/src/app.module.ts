import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigModule, AppConfigService } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './infrastructure/redis.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BrokerPortalModule } from './modules/broker-portal/broker-portal.module.js';
import { BrokersModule } from './modules/brokers/brokers.module.js';
import { ChargesModule } from './modules/charges/charges.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HmacModule } from './modules/hmac/hmac.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { MatchingModule } from './modules/matching/matching.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { RiskModule } from './modules/risk/risk.module.js';
import { TradesModule } from './modules/trades/trades.module.js';
import { WebsocketModule } from './modules/websocket/websocket.module.js';

/**
 * Top-level Nest module. ROUTES_ENABLED gates which controller groups mount:
 *   - "broker": broker-facing routes only (HMAC orders, JWT trades, websocket)
 *   - "admin":  admin-only routes (login + 2FA + interventions + approvals…)
 *   - "all":    both (default; used in single-binary deployments + dev)
 *
 * Domain modules used by either group (brokers repo, charges, ledger, audit,
 * risk, matching) are imported unconditionally — they're plumbing, not
 * surface area.
 */
@Module({})
export class AppModule {
  static register(): DynamicModule {
    const routesEnabled = (process.env.ROUTES_ENABLED ?? 'all') as 'all' | 'broker' | 'admin';

    const baseImports = [
      AppConfigModule,
      LoggerModule.forRootAsync({
        imports: [AppConfigModule],
        inject: [AppConfigService],
        useFactory: (cfg: AppConfigService) => {
          const pinoHttp: Record<string, unknown> = {
            level: cfg.get('LOG_LEVEL'),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                'req.headers["x-signature"]',
                'req.headers["x-admin-authorization"]',
                'req.headers["x-reauth-token"]',
                'res.headers["set-cookie"]',
                '*.password',
                '*.apiSecret',
                '*.secretHash',
                '*.refreshTokenHash',
                '*.totpSecretEnc',
                '*.reauthTokenHash',
                '*.recoveryCodesHash',
              ],
              censor: '[REDACTED]',
            },
            customProps: (req: { id: string }) => ({ requestId: req.id }),
          };
          if (cfg.isDev) {
            pinoHttp.transport = {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'HH:MM:ss.l' },
            };
          }
          return { pinoHttp };
        },
      }),
      DatabaseModule,
      RedisModule,
      EventEmitterModule.forRoot(),
      BullModule.forRootAsync({
        imports: [AppConfigModule],
        inject: [AppConfigService],
        useFactory: (cfg: AppConfigService) => ({
          connection: { url: cfg.get('REDIS_URL') },
        }),
      }),

      // Plumbing — always on
      AuditModule,
      BrokersModule,
      HealthModule,
      HmacModule,
      ChargesModule,
      LedgerModule,
      MatchingModule,
      RiskModule,
    ];

    const brokerImports = [
      AuthModule,
      OrdersModule,
      TradesModule,
      WebsocketModule,
      BrokerPortalModule,
    ];
    const adminImports = [AdminModule];

    const imports = [...baseImports];
    if (routesEnabled === 'all' || routesEnabled === 'broker') {
      imports.push(...brokerImports);
    }
    if (routesEnabled === 'all' || routesEnabled === 'admin') {
      imports.push(...adminImports);
    }

    return { module: AppModule, imports };
  }
}
