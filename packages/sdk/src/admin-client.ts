import { z, type ZodSchema } from 'zod';

import { SdkError } from './client.js';

export interface AdminSdkOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly token?: string;
  readonly reauthToken?: string;
  readonly timeoutMs?: number;
}

const apiSuccessSchema = <T>(inner: ZodSchema<T>) =>
  z.object({
    success: z.literal(true),
    data: inner,
    requestId: z.string(),
  });

const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string(),
  timestamp: z.string(),
});

const loginResponse = z.object({
  status: z.enum(['totp_setup_required', 'totp_required', 'success']),
});

const totpSetupResponse = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qrDataUrl: z.string(),
});

const totpFinalizeResponse = z.object({
  recoveryCodes: z.array(z.string()),
});

const reauthResponse = z.object({
  reauthToken: z.string(),
  expiresInSeconds: z.number(),
});

const walletAdjustResponse = z.discriminatedUnion('status', [
  z.object({ status: z.literal('executed'), entryIds: z.array(z.string()) }),
  z.object({ status: z.literal('queued_for_approval'), actionId: z.string() }),
]);

/**
 * Admin-side typed fetch client. Separate from `LpClient` because:
 *   - different cookie name (`lp_admin_access`)
 *   - different base URL prefix (`/api/v1/admin`)
 *   - reauth token presented as `X-Reauth-Token` for sensitive ops
 */
export class AdminClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: string | undefined;
  private readonly reauthToken: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: AdminSdkOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.token = opts.token;
    this.reauthToken = opts.reauthToken;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  withReauth(token: string): AdminClient {
    return new AdminClient({
      baseUrl: this.baseUrl,
      fetch: this.fetchImpl,
      ...(this.token ? { token: this.token } : {}),
      reauthToken: token,
      timeoutMs: this.timeoutMs,
    });
  }

  private async request<T>(path: string, init: RequestInit, schema: ZodSchema<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    headers.set('accept', 'application/json');
    if (this.token) {
      headers.set('x-admin-authorization', `Bearer ${this.token}`);
    }
    if (this.reauthToken) {
      headers.set('x-reauth-token', this.reauthToken);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
        credentials: 'include',
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const parsed = apiErrorSchema.safeParse(json);
      if (parsed.success) {
        throw new SdkError(
          parsed.data.error.code,
          parsed.data.error.message,
          res.status,
          parsed.data.requestId,
        );
      }
      throw new SdkError('HTTP_ERROR', `HTTP ${res.status}`, res.status);
    }

    return apiSuccessSchema(schema).parse(json).data as T;
  }

  // -------- Auth --------
  login(email: string, password: string) {
    return this.request(
      '/api/v1/admin/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      loginResponse,
    );
  }

  beginTotpSetup() {
    return this.request('/api/v1/admin/auth/2fa/setup', { method: 'POST' }, totpSetupResponse);
  }

  finalizeTotpSetup(code: string) {
    return this.request(
      '/api/v1/admin/auth/2fa/verify-setup',
      { method: 'POST', body: JSON.stringify({ code }) },
      totpFinalizeResponse,
    );
  }

  verifyTotp(code: string) {
    return this.request(
      '/api/v1/admin/auth/2fa/verify',
      { method: 'POST', body: JSON.stringify({ code }) },
      z.object({ ok: z.literal(true) }),
    );
  }

  useRecoveryCode(code: string) {
    return this.request(
      '/api/v1/admin/auth/recovery/use',
      { method: 'POST', body: JSON.stringify({ code }) },
      z.object({ ok: z.literal(true) }),
    );
  }

  reauth(password: string) {
    return this.request(
      '/api/v1/admin/auth/reauth',
      { method: 'POST', body: JSON.stringify({ password }) },
      reauthResponse,
    );
  }

  // -------- Interventions --------
  walletAdjust(input: {
    brokerId: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: string;
    currency?: string;
    reason: string;
  }) {
    return this.request(
      '/api/v1/admin/interventions/wallet-adjust',
      { method: 'POST', body: JSON.stringify(input) },
      walletAdjustResponse,
    );
  }

  // -------- Approvals --------
  listPendingApprovals() {
    return this.request(
      '/api/v1/admin/approvals/pending',
      { method: 'GET' },
      z.array(z.record(z.unknown())),
    );
  }

  approve(actionId: string, comment?: string) {
    return this.request(
      `/api/v1/admin/approvals/${encodeURIComponent(actionId)}/approve`,
      { method: 'POST', body: JSON.stringify({ comment }) },
      z.record(z.unknown()),
    );
  }

  // -------- Operations --------
  operationsMetrics() {
    return this.request(
      '/api/v1/admin/operations/metrics',
      { method: 'GET' },
      z.object({
        queueDepth: z.number(),
        tradesTotal: z.number(),
        timestamp: z.string(),
      }),
    );
  }
}
