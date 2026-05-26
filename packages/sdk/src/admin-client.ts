import { z, type ZodSchema, type ZodTypeAny } from 'zod';

import { SdkError } from './client.js';

export interface AdminSdkOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly token?: string;
  readonly reauthToken?: string;
  readonly timeoutMs?: number;
}

/**
 * Normalise a timestamp coming back from the API. Most envs send ISO strings,
 * but some test paths and the OpenAPI generator emit Date instances. We
 * annotate the return type explicitly because Zod's `.transform` inference
 * widens to `string | Date` from the conditional, which TS strict mode then
 * rejects when consumers pass the value to functions expecting `string`.
 */
const isoString = (v: string | Date): string => (v instanceof Date ? v.toISOString() : v);

const isoStringOrNull = (v: string | Date | null): string | null =>
  v instanceof Date ? v.toISOString() : v;

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

  // Schema generic is `ZodTypeAny` so we can infer the *output* type via
  // z.infer<S>. The previous `ZodSchema<T>` signature inferred T from the
  // schema's input shape for transformed schemas (e.g. `union(string, date)
  // .transform(isoString)`), which leaks `Date` into UI types even though the
  // runtime always produces strings.
  private async request<S extends ZodTypeAny>(
    path: string,
    init: RequestInit,
    schema: S,
  ): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    // Only declare a JSON body when we actually have one. Fastify rejects
    // requests with content-type=application/json + empty body, which broke
    // no-body POSTs like /auth/2fa/setup and /auth/logout.
    if (init.body != null) {
      headers.set('content-type', 'application/json');
    }
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

    // `apiSuccessSchema(schema).parse(json).data` is typed as `any` because
    // `ZodSchema<T>`'s T infers as `any` when our generic is `S extends
    // ZodTypeAny` — Zod doesn't expose a way to thread S's output through
    // the wrapping schema. We assert the resulting type explicitly.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- intentional cast
    return apiSuccessSchema(schema).parse(json).data as z.infer<S>;
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

  /**
   * End the current admin session. Server clears the lp_admin_access cookie
   * (both '/' and the legacy '/api/v1/admin' paths). UI should redirect to
   * /login on success.
   */
  logout() {
    return this.request(
      '/api/v1/admin/auth/logout',
      { method: 'POST' },
      z.object({ ok: z.literal(true) }),
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

  // -------- Audit --------
  listAudit(query: {
    actorId?: string | undefined;
    action?: string | undefined;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    limit?: number | undefined;
  }) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') {
        params.set(k, String(v));
      }
    }
    return this.request(
      `/api/v1/admin/audit/logs?${params.toString()}`,
      { method: 'GET' },
      z.object({
        items: z.array(
          z.object({
            id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => String(v)),
            auditId: z.string(),
            actorType: z.enum(['user', 'broker_api', 'system']),
            actorId: z.string(),
            action: z.string(),
            resourceType: z.string().nullable(),
            resourceId: z.string().nullable(),
            outcome: z.enum(['success', 'failure']),
            metadata: z.record(z.unknown()).nullable(),
            ipAddress: z.string().nullable(),
            userAgent: z.string().nullable(),
            createdAt: z.union([z.string(), z.date()]).transform(isoString),
          }),
        ),
      }),
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

  // -------- Brokers --------
  listBrokers() {
    return this.request(
      '/api/v1/admin/brokers',
      { method: 'GET' },
      z.array(
        z.object({
          id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => String(v)),
          brokerId: z.string(),
          displayName: z.string(),
          contactEmail: z.string(),
          status: z.enum(['active', 'suspended', 'closed']),
          createdAt: z.union([z.string(), z.date()]).transform(isoString),
          updatedAt: z.union([z.string(), z.date()]).transform(isoString),
        }),
      ),
    );
  }

  brokerDetail(brokerId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}`,
      { method: 'GET' },
      z.object({
        brokerId: z.string(),
        displayName: z.string(),
        contactEmail: z.string(),
        status: z.enum(['active', 'suspended', 'closed']),
        createdAt: z.union([z.string(), z.date()]).transform(isoString),
        updatedAt: z.union([z.string(), z.date()]).transform(isoString),
      }),
    );
  }

  /**
   * Create a broker. If `firstUser` is supplied, the broker entity AND the
   * first dashboard user are created in the same transaction — partial
   * states are impossible. The plaintext password is sent over TLS only;
   * the server stores an Argon2 hash and never logs the password.
   */
  createBroker(input: {
    brokerId: string;
    displayName: string;
    contactEmail: string;
    firstUser?: {
      email: string;
      displayName: string;
      password: string;
    };
  }) {
    return this.request(
      '/api/v1/admin/brokers',
      { method: 'POST', body: JSON.stringify(input) },
      z.object({
        brokerId: z.string(),
        displayName: z.string(),
        contactEmail: z.string(),
        status: z.string(),
        firstUser: z.object({ userId: z.string(), email: z.string() }).nullable().optional(),
      }),
    );
  }

  suspendBroker(brokerId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/suspend`,
      { method: 'POST' },
      z.record(z.unknown()),
    );
  }

  reactivateBroker(brokerId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/reactivate`,
      { method: 'POST' },
      z.record(z.unknown()),
    );
  }

  listApiKeys(brokerId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/api-keys`,
      { method: 'GET' },
      z.array(
        z.object({
          apiKeyId: z.string(),
          label: z.string(),
          keyPrefix: z.string(),
          // No `.default([])` — the DB column is NOT NULL with default '{}',
          // so the API always serializes a real array. Adding `.default([])`
          // widens the inferred output to `string[] | undefined`, which TS
          // strict mode rejects at the UI use site.
          ipAllowlist: z.array(z.string()),
          createdAt: z.union([z.string(), z.date()]).transform(isoString),
          lastUsedAt: z.union([z.string(), z.date(), z.null()]).transform(isoStringOrNull),
          revokedAt: z.union([z.string(), z.date(), z.null()]).transform(isoStringOrNull),
          status: z.enum(['active', 'revoked']),
        }),
      ),
    );
  }

  /**
   * Issue a new HMAC API key for a broker. Server returns `plaintextApiKey`
   * exactly once — UI must show it in a "copy now" modal, then forget it.
   * After this call the secret only exists as an Argon2 hash on the server.
   */
  issueApiKey(brokerId: string, input: { label: string; ipAllowlist?: string[] }) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/api-keys`,
      { method: 'POST', body: JSON.stringify(input) },
      z.object({
        apiKeyId: z.string(),
        label: z.string(),
        keyPrefix: z.string(),
        brokerId: z.string(),
        createdAt: z.union([z.string(), z.date()]).transform(isoString),
        plaintextApiKey: z.string(),
        warning: z.string(),
      }),
    );
  }

  revokeApiKey(brokerId: string, apiKeyId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/api-keys/${encodeURIComponent(apiKeyId)}`,
      { method: 'DELETE' },
      z.object({
        apiKeyId: z.string(),
        revokedAt: z.union([z.string(), z.date()]).transform(isoString),
      }),
    );
  }

  /**
   * Preflight check before hard-delete: returns the count of records that
   * would block deletion (orders, trades, api keys, users). The UI uses
   * this to either enable the Delete button (all zero) or show a "use
   * suspend instead" refusal with the breakdown.
   */
  brokerDependents(brokerId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/dependents`,
      { method: 'GET' },
      z.object({
        orders: z.number(),
        trades: z.number(),
        apiKeys: z.number(),
        users: z.number(),
      }),
    );
  }

  /**
   * Hard delete a broker. The server refuses with 409 if any orders /
   * trades / api keys / users reference this broker — UI should preflight
   * with `brokerDependents` and disable the action if any > 0.
   */
  deleteBroker(brokerId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}`,
      { method: 'DELETE' },
      z.object({
        brokerId: z.string(),
        deletedAt: z.string(),
      }),
    );
  }

  // -------- Broker dashboard users --------

  listBrokerUsers(brokerId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/users`,
      { method: 'GET' },
      z.array(
        z.object({
          userId: z.string(),
          email: z.string(),
          displayName: z.string(),
          role: z.string(),
          createdAt: z.union([z.string(), z.date()]).transform(isoString),
          suspendedAt: z.union([z.string(), z.date(), z.null()]).transform(isoStringOrNull),
          mustChangePassword: z.boolean(),
          status: z.enum(['active', 'suspended']),
        }),
      ),
    );
  }

  /**
   * Create a broker dashboard user. If `temporaryPassword` is omitted, the
   * server generates one and returns it. Either way, the plaintext is shown
   * exactly once in the response; subsequent calls only return metadata.
   */
  createBrokerUser(
    brokerId: string,
    input: { email: string; displayName: string; temporaryPassword?: string },
  ) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/users`,
      { method: 'POST', body: JSON.stringify(input) },
      z.object({
        userId: z.string(),
        email: z.string(),
        displayName: z.string(),
        brokerId: z.string(),
        createdAt: z.union([z.string(), z.date()]).transform(isoString),
        temporaryPassword: z.string(),
        passwordWasGenerated: z.boolean(),
        warning: z.string(),
      }),
    );
  }

  suspendBrokerUser(brokerId: string, userId: string) {
    return this.request(
      `/api/v1/admin/brokers/${encodeURIComponent(brokerId)}/users/${encodeURIComponent(userId)}/suspend`,
      { method: 'POST' },
      z.object({
        userId: z.string(),
        suspendedAt: z.union([z.string(), z.date()]).transform(isoString),
      }),
    );
  }
}
