import { randomBytes } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';

import { ErrorCode } from '@lp/constants';
import { decrypt, encrypt } from '@lp/utils/encryption';
import { ulid } from '@lp/utils/id';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { AppConfigService } from '../../../config/config.module.js';

import { AdminAuthRepository } from './admin-auth.repository.js';

import type { UserRow } from '../../auth/schema/user.schema.js';

export interface AdminJwtPayload {
  sub: string;
  sid: string;
  role: 'super_admin' | 'ops' | 'support' | 'read_only';
  email: string;
}

export interface LoginResult {
  status: 'totp_setup_required' | 'totp_required' | 'success';
  sessionId: string;
  accessToken: string;
}

export interface TotpSetupResult {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export interface TotpVerifySetupResult {
  recoveryCodes: string[];
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly repo: AdminAuthRepository,
    private readonly jwt: JwtService,
    private readonly cfg: AppConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    ua: string | undefined,
    ip: string | undefined,
  ): Promise<LoginResult & { user: UserRow }> {
    const user = await this.repo.findAdminByEmail(email);
    if (!user) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (user.suspendedAt) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Account suspended',
        HttpStatus.FORBIDDEN,
      );
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!user.adminRole) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Admin role missing',
        HttpStatus.FORBIDDEN,
      );
    }

    const sessionId = ulid();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // hard cap 12h
    const session = await this.repo.createSession({
      sessionId,
      userId: user.userId,
      issuedAt: new Date(),
      expiresAt,
      lastActivityAt: new Date(),
      // 2FA disabled: mark the session TOTP-verified at login so the
      // TotpVerifiedGuard passes with email + password alone.
      totpVerifiedAt: new Date(),
      userAgent: ua ?? null,
      ipAddress: ip ?? null,
    });

    // 2FA disabled: email + password is sufficient — go straight to the
    // dashboard instead of routing through the TOTP setup/verify pages.
    const status: LoginResult['status'] = 'success';

    const payload: AdminJwtPayload = {
      sub: user.userId,
      sid: session.sessionId,
      role: user.adminRole,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.cfg.get('ADMIN_JWT_SECRET'),
      expiresIn: this.cfg.get('ADMIN_JWT_EXPIRY'),
    });

    return { status, sessionId: session.sessionId, accessToken, user };
  }

  async beginTotpSetup(user: UserRow): Promise<TotpSetupResult> {
    if (user.totpVerifiedAt) {
      throw new DomainException(
        ErrorCode.CONFLICT,
        'TOTP already configured — use force-reset flow',
        HttpStatus.CONFLICT,
      );
    }
    const secret = authenticator.generateSecret();
    const ciphertext = encrypt(secret, this.cfg.get('TOTP_ENCRYPTION_KEY'));
    await this.repo.updateUserTotp(user.userId, ciphertext);

    const issuer = this.cfg.get('TOTP_ISSUER');
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrDataUrl };
  }

  async finalizeTotpSetup(user: UserRow, code: string): Promise<TotpVerifySetupResult> {
    if (!user.totpSecretEnc) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'TOTP setup not started',
        HttpStatus.BAD_REQUEST,
      );
    }
    const secret = decrypt(user.totpSecretEnc, this.cfg.get('TOTP_ENCRYPTION_KEY'));
    if (!authenticator.check(code, secret)) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid TOTP code',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const recoveryCodes = generateRecoveryCodes(10);
    const hashes = await Promise.all(recoveryCodes.map((c) => argon2.hash(c)));
    await this.repo.finalizeTotp(user.userId, hashes);
    return { recoveryCodes };
  }

  async verifyTotp(user: UserRow, sessionId: string, code: string): Promise<void> {
    if (!user.totpSecretEnc || !user.totpVerifiedAt) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'TOTP not configured',
        HttpStatus.BAD_REQUEST,
      );
    }
    const secret = decrypt(user.totpSecretEnc, this.cfg.get('TOTP_ENCRYPTION_KEY'));
    if (!authenticator.check(code, secret)) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid TOTP code',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.repo.markTotpVerified(sessionId);
  }

  async consumeRecoveryCode(user: UserRow, sessionId: string, code: string): Promise<void> {
    const codes = user.recoveryCodesHash ?? [];
    let matchedIdx = -1;
    for (let i = 0; i < codes.length; i++) {
      const hash = codes[i];
      if (!hash) {
        continue;
      }

      if (await argon2.verify(hash, code)) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx === -1) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid recovery code',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.repo.consumeRecoveryCode(user.userId, matchedIdx);
    await this.repo.markTotpVerified(sessionId);
  }

  async issueReauthToken(user: UserRow, sessionId: string, password: string): Promise<string> {
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new DomainException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const token = randomBytes(32).toString('base64url');
    const hash = await argon2.hash(token);
    const validUntil = new Date(Date.now() + this.cfg.get('ADMIN_REAUTH_WINDOW_SECONDS') * 1000);
    await this.repo.setReauth(sessionId, hash, validUntil);
    return token;
  }

  async verifyJwt(token: string): Promise<AdminJwtPayload> {
    return this.jwt.verifyAsync<AdminJwtPayload>(token, {
      secret: this.cfg.get('ADMIN_JWT_SECRET'),
    });
  }
}

function generateRecoveryCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(8).toString('hex')); // 16 hex chars
  }
  return codes;
}
