import { Body, Controller, Post, Res, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { loginSchema, type LoginDto } from '@lp/validators';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AppConfigService } from '../../config/config.module.js';
import { AuditService } from '../audit/audit.service.js';

import { AuthService } from './auth.service.js';

import type { FastifyReply } from 'fastify';

@ApiTags('broker/auth')
@Controller('api/v1/broker/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly cfg: AppConfigService,
  ) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ userId: string }> {
    const { userId, accessToken } = await this.auth.login(dto);
    void reply.setCookie('lp_access', accessToken, {
      httpOnly: true,
      secure: this.cfg.isProd,
      sameSite: 'strict',
      path: '/',
    });
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'auth.login',
      outcome: 'success',
    });
    return { userId };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) reply: FastifyReply): { ok: true } {
    void reply.clearCookie('lp_access', { path: '/' });
    return { ok: true };
  }
}
