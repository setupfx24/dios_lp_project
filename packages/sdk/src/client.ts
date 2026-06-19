import { z, type ZodSchema } from 'zod';

import {
  loginSchema,
  tradeRecordSchema,
  tradeListQuerySchema,
  type LoginDto,
  type TradeRecordDto,
  type TradeListQuery,
} from '@lp/validators';

/**
 * Broker trades-list item: the canonical trade record plus the originating
 * order's clientOrderId (DIOS sends the close leg as "<tradeId>-C", so the UI
 * labels OPEN vs CLOSE) and the summed post-trade charges.
 */
const tradeListItemSchema = tradeRecordSchema.extend({
  clientOrderId: z.string().nullable().optional(),
  clientUserLabel: z.string().nullable().optional(),
  chargesTotal: z.string().optional(),
});
export type TradeListItem = z.infer<typeof tradeListItemSchema>;

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
    items: TradeListItem[];
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
        items: z.array(tradeListItemSchema),
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

  // -------- Account / wallet / ledger / orders (broker portal) --------
  getMe(): Promise<BrokerMe> {
    return this.request('/api/v1/broker/me', { method: 'GET' }, brokerMeSchema);
  }

  getPositions(): Promise<{ positions: BrokerPosition[]; totalPnl: string; ts: string }> {
    return this.request(
      '/api/v1/broker/positions',
      { method: 'GET' },
      z.object({
        positions: z.array(brokerPositionSchema),
        totalPnl: z.string(),
        ts: z.string(),
      }),
    );
  }

  getWallet(): Promise<{ wallets: BrokerWallet[] }> {
    return this.request(
      '/api/v1/broker/wallet',
      { method: 'GET' },
      z.object({ wallets: z.array(brokerWalletSchema) }),
    );
  }

  listLedger(limit = 100): Promise<{ items: LedgerEntryDto[] }> {
    return this.request(
      `/api/v1/broker/ledger?limit=${limit}`,
      { method: 'GET' },
      z.object({ items: z.array(ledgerEntrySchema) }),
    );
  }

  listOrders(query: { status?: string; limit?: number } = {}): Promise<{ items: OrderDto[] }> {
    const search = new URLSearchParams();
    if (query.status) search.set('status', query.status);
    if (query.limit) search.set('limit', String(query.limit));
    return this.request(
      `/api/v1/broker/orders?${search.toString()}`,
      { method: 'GET' },
      z.object({ items: z.array(orderSchema) }),
    );
  }
}

// Over the wire these arrive as strings already (bigint via the API's
// BigInt JSON shim; timestamps as ISO) — no transform needed.
const idToString = z.string();
const dateToIso = z.string();

const brokerMeSchema = z.object({
  broker: z.object({
    brokerId: z.string(),
    displayName: z.string(),
    contactEmail: z.string(),
    status: z.string(),
    createdAt: dateToIso,
  }),
  user: z.object({ email: z.string(), role: z.string() }).nullable(),
});

const brokerWalletSchema = z.object({
  walletId: z.string(),
  currency: z.string(),
  balance: z.string(),
});

const brokerPositionSchema = z.object({
  tradeId: z.string(),
  userLabel: z.string().nullable().optional(),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.string(),
  openPrice: z.string(),
  currentPrice: z.string(),
  floatingPnl: z.string(),
});
export type BrokerPosition = z.infer<typeof brokerPositionSchema>;

const ledgerEntrySchema = z.object({
  id: idToString,
  entryId: z.string(),
  walletId: z.string(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string(),
  currency: z.string(),
  referenceType: z.string(),
  referenceId: z.string(),
  description: z.string(),
  createdAt: dateToIso,
});

const orderSchema = z.object({
  id: idToString,
  orderId: z.string(),
  clientOrderId: z.string(),
  brokerId: z.string(),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  type: z.string(),
  quantity: z.string(),
  price: z.string().nullable(),
  timeInForce: z.string(),
  status: z.string(),
  rejectionReason: z.string().nullable(),
  receivedAt: dateToIso,
  updatedAt: dateToIso,
});

export type BrokerMe = z.infer<typeof brokerMeSchema>;
export type BrokerWallet = z.infer<typeof brokerWalletSchema>;
export type LedgerEntryDto = z.infer<typeof ledgerEntrySchema>;
export type OrderDto = z.infer<typeof orderSchema>;
