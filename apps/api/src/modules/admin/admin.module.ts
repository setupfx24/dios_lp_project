import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { AppConfigModule } from '../../config/config.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { TradesModule } from '../trades/trades.module.js';

import { AdminUsersController } from './admin-users/admin-users.controller.js';
import { ApprovalsController } from './approvals/approvals.controller.js';
import { PendingActionsRepository } from './approvals/pending-actions.repository.js';
import { AuditQueryController } from './audit-query/audit-query.controller.js';
import { AdminAuthController } from './auth/admin-auth.controller.js';
import { AdminAuthRepository } from './auth/admin-auth.repository.js';
import { AdminAuthService } from './auth/admin-auth.service.js';
import { BrokersAdminController } from './brokers-admin/brokers-admin.controller.js';
import { DepositsAdminController } from './deposits/deposits-admin.controller.js';
import { AdminJwtGuard } from './common/admin-jwt.guard.js';
import { AdminRoleGuard } from './common/admin-role.guard.js';
import { AuditLogInterceptor } from './common/audit-log.interceptor.js';
import { ReauthGuard } from './common/reauth.guard.js';
import { TotpVerifiedGuard } from './common/totp-verified.guard.js';
import { InterventionsController } from './interventions/interventions.controller.js';
import { OperationsController } from './operations/operations.controller.js';

/**
 * The whole admin surface is mounted ONLY when ROUTES_ENABLED includes "admin".
 * App.module imports this conditionally — see app.module.ts.
 *
 * Admin auth uses a separate JWT secret (ADMIN_JWT_SECRET) supplied
 * per-call inside AdminAuthService. Broker JWTs cannot authenticate against
 * any controller in this module.
 */
@Module({
  imports: [
    AppConfigModule,
    LedgerModule,
    TradesModule,
    // The token is signed/verified manually in AdminAuthService with
    // ADMIN_JWT_SECRET, so we only register JwtModule to enable injection.
    JwtModule.register({}),
  ],
  controllers: [
    AdminAuthController,
    ApprovalsController,
    InterventionsController,
    AuditQueryController,
    OperationsController,
    BrokersAdminController,
    DepositsAdminController,
    AdminUsersController,
  ],
  providers: [
    AdminAuthRepository,
    AdminAuthService,
    PendingActionsRepository,
    AdminJwtGuard,
    TotpVerifiedGuard,
    AdminRoleGuard,
    ReauthGuard,
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AdminModule {}
