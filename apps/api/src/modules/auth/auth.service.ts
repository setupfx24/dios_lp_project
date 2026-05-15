import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../common/exceptions/domain.exception.js';
import { AppConfigService } from '../../config/config.module.js';

import { AuthRepository } from './auth.repository.js';

import type { UserRole } from '@lp/types';
import type { LoginDto } from '@lp/validators';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  brokerId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly cfg: AppConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{ userId: string; accessToken: string }> {
    const user = await this.repo.findByEmail(dto.email);
    if (!user) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      role: user.role as UserRole,
      brokerId: user.brokerId,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.cfg.get('JWT_EXPIRY'),
    });
    return { userId: user.userId, accessToken };
  }

  async verify(token: string): Promise<JwtPayload> {
    return this.jwt.verifyAsync<JwtPayload>(token);
  }
}
