import { Body, Controller, Post, Req, Res, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { cookieDomainOpt } from '../../../common/cookie-domain.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AppConfigService } from '../../../config/config.module.js';
import { requireAdminCtx } from '../common/admin-context.js';
import { AdminUser } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { SkipTotpVerified, TotpVerifiedGuard } from '../common/totp-verified.guard.js';

import { AdminAuthService } from './admin-auth.service.js';

import type { UserRow } from '../../auth/schema/user.schema.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const ADMIN_COOKIE = 'lp_admin_access';
const ADMIN_ACTIVITY_COOKIE = 'lp_admin_last_activity';

const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(256),
});

const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

const recoveryBodySchema = z.object({
  code: z.string().min(8).max(64),
});

const reauthBodySchema = z.object({
  password: z.string().min(8).max(256),
});

@ApiTags('admin/auth')
@Controller('api/v1/admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cfg: AppConfigService,
  ) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginBodySchema))
  async login(
    @Body() body: z.infer<typeof loginBodySchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: 'totp_setup_required' | 'totp_required' | 'success' }> {
    const result = await this.auth.login(
      body.email,
      body.password,
      req.headers['user-agent'],
      req.ip,
    );
    // Share the cookie across subdomains (admin.* + api.*) when configured, so
    // the admin app's middleware can read what the API sets. Unset => host-only.
    const domainOpt = cookieDomainOpt(this.cfg);
    // Self-heal: drop any stale cookie left at the previous narrower path —
    // it would shadow the new path='/' cookie on /api/v1/admin/* requests
    // (browser sends the more-specific path first) and cause 401s.
    void reply.clearCookie(ADMIN_COOKIE, { path: '/api/v1/admin', ...domainOpt });
    // Also drop any stale HOST-ONLY cookie from logins issued before
    // COOKIE_DOMAIN was set; otherwise the browser sends both it and the new
    // domain-scoped cookie, and the API may read the stale (expired) one first.
    if (domainOpt.domain) {
      void reply.clearCookie(ADMIN_COOKIE, { path: '/' });
      void reply.clearCookie(ADMIN_ACTIVITY_COOKIE, { path: '/' });
    }
    void reply.setCookie(ADMIN_COOKIE, result.accessToken, {
      httpOnly: true,
      secure: this.cfg.isProd,
      sameSite: 'strict',
      path: '/',
      ...domainOpt,
    });
    // Reset the activity marker the admin-app middleware uses for its idle
    // check; otherwise a stale value from a prior session makes the first
    // post-login request look idle and bounces back to /login?reason=idle.
    void reply.setCookie(ADMIN_ACTIVITY_COOKIE, String(Date.now()), {
      httpOnly: false,
      secure: this.cfg.isProd,
      sameSite: 'strict',
      path: '/',
      ...domainOpt,
    });
    return { status: result.status };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) reply: FastifyReply): { ok: true } {
    // Must mirror the domain used at login, else the clear-cookie misses.
    const domainOpt = cookieDomainOpt(this.cfg);
    void reply.clearCookie(ADMIN_COOKIE, { path: '/', ...domainOpt });
    void reply.clearCookie(ADMIN_COOKIE, { path: '/api/v1/admin', ...domainOpt });
    void reply.clearCookie(ADMIN_ACTIVITY_COOKIE, { path: '/', ...domainOpt });
    return { ok: true };
  }

  // ---- 2FA setup (still needs JWT but TOTP-verified is exempted) ----
  @Post('2fa/setup')
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  @SkipTotpVerified()
  async beginTotpSetup(@AdminUser() user: UserRow) {
    return this.auth.beginTotpSetup(user);
  }

  @Post('2fa/verify-setup')
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  @SkipTotpVerified()
  @UsePipes(new ZodValidationPipe(totpCodeSchema))
  finalizeTotpSetup(@AdminUser() user: UserRow, @Body() body: z.infer<typeof totpCodeSchema>) {
    return this.auth.finalizeTotpSetup(user, body.code);
  }

  @Post('2fa/verify')
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  @SkipTotpVerified()
  @UsePipes(new ZodValidationPipe(totpCodeSchema))
  async verifyTotp(
    @Req() req: FastifyRequest,
    @Body() body: z.infer<typeof totpCodeSchema>,
  ): Promise<{ ok: true }> {
    const ctx = requireAdminCtx(req);
    await this.auth.verifyTotp(ctx.user, ctx.session.sessionId, body.code);
    return { ok: true };
  }

  @Post('recovery/use')
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  @SkipTotpVerified()
  @UsePipes(new ZodValidationPipe(recoveryBodySchema))
  async useRecovery(
    @Req() req: FastifyRequest,
    @Body() body: z.infer<typeof recoveryBodySchema>,
  ): Promise<{ ok: true }> {
    const ctx = requireAdminCtx(req);
    await this.auth.consumeRecoveryCode(ctx.user, ctx.session.sessionId, body.code);
    return { ok: true };
  }

  @Post('reauth')
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  @UsePipes(new ZodValidationPipe(reauthBodySchema))
  async reauth(
    @Req() req: FastifyRequest,
    @Body() body: z.infer<typeof reauthBodySchema>,
  ): Promise<{ reauthToken: string; expiresInSeconds: number }> {
    const ctx = requireAdminCtx(req);
    const token = await this.auth.issueReauthToken(ctx.user, ctx.session.sessionId, body.password);
    return {
      reauthToken: token,
      expiresInSeconds: this.cfg.get('ADMIN_REAUTH_WINDOW_SECONDS'),
    };
  }
}
