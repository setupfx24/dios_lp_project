import { z, type ZodSchema } from 'zod';

import {
  loginSchema,
  tradeRecordSchema,
  tradeListQuerySchema,
  type LoginDto,
  type TradeRecordDto,
  type TradeListQuery,
} from '@lp/validators';

export interface SdkOptions {
  readonly baseUrl: string;
  /** Optional fetch override (Next.js server components want to inject `fetch` with caching opts). */
  readonly fetch?: typeof fetch;
  /** Bearer token (dashboard JWT). Cookie-based auth doesn't need this. */
  readonly token?: string;
  /** Request timeout in ms. */
  readonly timeoutMs?: number;
}

export class SdkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'SdkError';
  }
}

function apiSuccessSchema<T>(inner: ZodSchema<T>) {
  return z.object({
    success: z.literal(true),
    data: inner,
    requestId: z.string(),
  });
}

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

export class LpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: SdkOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    responseSchema: ZodSchema<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    headers.set('accept', 'application/json');
    if (this.token) {
      headers.set('authorization', `Bearer ${this.token}`);
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

    const envelope = apiSuccessSchema(responseSchema).parse(json);
    return envelope.data as T;
  }

  // -------- Auth --------
  login(body: LoginDto): Promise<{ userId: string }> {
    return this.request(
      '/api/v1/broker/auth/login',
      { method: 'POST', body: JSON.stringify(loginSchema.parse(body)) },
      z.object({ userId: z.string() }),
    );
  }

  logout(): Promise<{ ok: true }> {
    return this.request(
      '/api/v1/broker/auth/logout',
      { method: 'POST' },
      z.object({ ok: z.literal(true) }),
    );
  }

  // -------- Trades --------
  listTrades(query: Partial<TradeListQuery> = {}): Promise<{
    items: TradeRecordDto[];
    nextCursor: string | null;
  }> {
    const validated = tradeListQuerySchema.parse(query);
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(validated)) {
      if (v !== undefined) {
        search.set(k, String(v));
      }
    }
    return this.request(
      `/api/v1/broker/trades?${search.toString()}`,
      { method: 'GET' },
      z.object({
        items: z.array(tradeRecordSchema),
        nextCursor: z.string().nullable(),
      }),
    );
  }

  getTrade(tradeId: string): Promise<TradeRecordDto> {
    return this.request(
      `/api/v1/broker/trades/${encodeURIComponent(tradeId)}`,
      { method: 'GET' },
      tradeRecordSchema,
    );
  }
}
