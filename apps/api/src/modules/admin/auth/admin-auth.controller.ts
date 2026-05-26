import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { z } from 'zod';

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
  // M5: admin login brake. Tighter than broker login because the blast radius
  // of a compromised admin account is much higher.
  @Throttle({ short: { ttl: seconds(60), limit: 5 } })
  async login(
    @Body(new ZodValidationPipe(loginBodySchema)) body: z.infer<typeof loginBodySchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: 'totp_setup_required' | 'totp_required' | 'success' }> {
    const result = await this.auth.login(
      body.email,
      body.password,
      req.headers['user-agent'],
      req.ip,
    );
    // Wipe any stale cookie issued under the old `/api/v1/admin` path scope.
    // Browsers identify cookies by (name, domain, path) — without this clear,
    // a user who logged in before this fix has TWO `lp_admin_access` cookies
    // and the server may read the wrong (expired) one first.
    void reply.clearCookie(ADMIN_COOKIE, { path: '/api/v1/admin' });

    // path:'/' so the cookie is sent on requests to the admin Next.js app
    // (e.g. /operations, /brokers) as well as the API. The previous
    // '/api/v1/admin' scope meant the browser only sent it on API calls,
    // so the admin app's middleware never saw the cookie and bounced the
    // user back to /login after 2FA setup. HttpOnly + SameSite=strict still
    // protect against XSS / CSRF.
    void reply.setCookie(ADMIN_COOKIE, result.accessToken, {
      httpOnly: true,
      secure: this.cfg.isProd,
      sameSite: 'strict',
      path: '/',
    });
    return { status: result.status };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) reply: FastifyReply): { ok: true } {
    void reply.clearCookie(ADMIN_COOKIE, { path: '/' });
    void reply.clearCookie(ADMIN_COOKIE, { path: '/api/v1/admin' });
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
  finalizeTotpSetup(
    @AdminUser() user: UserRow,
    @Body(new ZodValidationPipe(totpCodeSchema)) body: z.infer<typeof totpCodeSchema>,
  ) {
    return this.auth.finalizeTotpSetup(user, body.code);
  }

  @Post('2fa/verify')
  // M5: TOTP brute-force brake. 6 digits = 10^6 search space; without a
  // brake an attacker who has the password could try every code in seconds.
  @Throttle({ short: { ttl: seconds(60), limit: 5 } })
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  @SkipTotpVerified()
  async verifyTotp(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(totpCodeSchema)) body: z.infer<typeof totpCodeSchema>,
  ): Promise<{ ok: true }> {
    const ctx = requireAdminCtx(req);
    await this.auth.verifyTotp(ctx.user, ctx.session.sessionId, body.code);
    return { ok: true };
  }

  @Post('recovery/use')
  // M5: recovery codes are higher-entropy than TOTP but still finite.
  @Throttle({ short: { ttl: seconds(60), limit: 5 } })
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  @SkipTotpVerified()
  async useRecovery(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(recoveryBodySchema)) body: z.infer<typeof recoveryBodySchema>,
  ): Promise<{ ok: true }> {
    const ctx = requireAdminCtx(req);
    await this.auth.consumeRecoveryCode(ctx.user, ctx.session.sessionId, body.code);
    return { ok: true };
  }

  @Post('reauth')
  // M5: reauth re-prompts for the user's password to unlock a sensitive
  // window. Same brute-force vector as login, same brake.
  @Throttle({ short: { ttl: seconds(60), limit: 5 } })
  @UseGuards(AdminJwtGuard, TotpVerifiedGuard)
  async reauth(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(reauthBodySchema)) body: z.infer<typeof reauthBodySchema>,
  ): Promise<{ reauthToken: string; expiresInSeconds: number }> {
    const ctx = requireAdminCtx(req);
    const token = await this.auth.issueReauthToken(ctx.user, ctx.session.sessionId, body.password);
    return {
      reauthToken: token,
      expiresInSeconds: this.cfg.get('ADMIN_REAUTH_WINDOW_SECONDS'),
    };
  }
}
