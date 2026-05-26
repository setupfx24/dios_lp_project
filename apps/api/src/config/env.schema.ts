import { z } from 'zod';

/**
 * Parses the CORS_ORIGINS env string ("http://a,http://b") into a normalised
 * list. Exported so non-Nest entry points (e.g. the WebSocket gateway, whose
 * `@WebSocketGateway` decorator runs at class-load time and can't inject
 * ConfigService) can apply the same allow-list as the REST stack in main.ts.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

    DATABASE_URL: z.string().url().describe('postgres://user:pass@host:5432/db'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

    REDIS_URL: z.string().url().describe('redis://host:6379'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRY: z.string().default('15m'),
    JWT_REFRESH_EXPIRY: z.string().default('7d'),

    /**
     * Signing secret for the fastify-cookie plugin. Used to sign session cookies
     * so a stolen unsigned cookie can't be forged. MUST be distinct from
     * JWT_SECRET and ADMIN_JWT_SECRET — sharing the same secret across the
     * cookie-signing and JWT-issuance trust domains means a leak of one
     * compromises both. Enforced at startup by a refine below.
     */
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),

    HMAC_REPLAY_WINDOW_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3001,http://localhost:3002')
      .transform(parseCorsOrigins),

    SWAGGER_ENABLED: z.coerce.boolean().default(true),

    /**
     * Which controller groups to mount.
     *   - "all"    : both /api/v1/broker/* and /api/v1/admin/* (default)
     *   - "broker" : only broker routes (public-facing api deployment)
     *   - "admin"  : only admin routes (private subnet deployment)
     * Same binary; topology is a deploy-time choice.
     */
    ROUTES_ENABLED: z.enum(['all', 'broker', 'admin']).default('all'),

    // Admin auth — separate secret + cookie from broker JWT.
    ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
    ADMIN_JWT_EXPIRY: z.string().default('15m'),

    // Reauth window for sensitive admin actions (default 5 minutes).
    ADMIN_REAUTH_WINDOW_SECONDS: z.coerce.number().int().min(60).max(900).default(300),

    // Threshold above which admin actions need 4-eyes approval (in paise).
    // Default ₹10,000 = 10_00_000 paise.
    ADMIN_4EYES_THRESHOLD_PAISE: z.coerce.number().int().min(0).default(1_000_000),

    // Idle timeout for admin sessions (default 15 minutes).
    ADMIN_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),

    // AES-256-GCM passphrase for at-rest encryption of TOTP secrets.
    TOTP_ENCRYPTION_KEY: z.string().min(32, 'TOTP_ENCRYPTION_KEY must be at least 32 characters'),

    // Issuer label shown in authenticator apps.
    TOTP_ISSUER: z.string().default('LP Platform'),
  })
  .superRefine((env, ctx) => {
    // H6: Fail-closed CORS in production. The dev default
    // ("http://localhost:3001,http://localhost:3002") is convenient locally but
    // would silently mask a deploy misconfiguration in prod — an operator who
    // forgets to set CORS_ORIGINS should get a hard startup error, not a
    // dev-only allow-list. We check raw process.env (not the parsed value)
    // because `.default()` makes the parsed value indistinguishable from
    // explicit input by the time we reach this refine.
    if (env.NODE_ENV === 'production') {
      const raw = process.env.CORS_ORIGINS;
      if (typeof raw !== 'string' || raw.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message:
            'CORS_ORIGINS must be explicitly set when NODE_ENV=production. ' +
            'Example: CORS_ORIGINS=https://app.example.com,https://admin.example.com',
        });
      }
    }

    // H7: Refuse startup if cookie-signing secret matches either JWT secret.
    // Sharing secrets across trust domains means leak of one compromises both.
    if (env.COOKIE_SECRET === env.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECRET'],
        message: 'COOKIE_SECRET must differ from JWT_SECRET (separate trust domains)',
      });
    }
    if (env.COOKIE_SECRET === env.ADMIN_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECRET'],
        message: 'COOKIE_SECRET must differ from ADMIN_JWT_SECRET (separate trust domains)',
      });
    }

    // M2: In production, refuse startup if any secret env var still matches a
    // known placeholder from .env.example. The placeholder list is documented
    // (anyone with internet access can read .env.example from the repo), so a
    // deploy that uses them is equivalent to running with no auth at all.
    if (env.NODE_ENV === 'production') {
      for (const [name, value] of [
        ['JWT_SECRET', env.JWT_SECRET],
        ['COOKIE_SECRET', env.COOKIE_SECRET],
        ['ADMIN_JWT_SECRET', env.ADMIN_JWT_SECRET],
        ['TOTP_ENCRYPTION_KEY', env.TOTP_ENCRYPTION_KEY],
      ] as const) {
        if (KNOWN_PLACEHOLDER_SECRETS.has(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: `${name} is still set to the .env.example placeholder. Generate a fresh random value (e.g. \`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"\`)`,
          });
        }
      }
      // Database URL is `postgres://user:PASSWORD@host…` — sniff for the known
      // placeholder password in the connection string.
      if (env.DATABASE_URL.includes('changeme_in_compose_env')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message:
            'DATABASE_URL contains the .env.example placeholder password "changeme_in_compose_env". Rotate the lp_app role password and update DATABASE_URL.',
        });
      }
    }
  });

/**
 * Exact-match set of placeholder secret values shipped in apps/api/.env.example.
 * If any of these reach production they're equivalent to having no auth — the
 * values are public by virtue of being in source control. Update this set
 * whenever .env.example placeholders change.
 */
const KNOWN_PLACEHOLDER_SECRETS = new Set<string>([
  'devsecret_at_least_32_characters_long',
  'devcookiesecret_at_least_32_characters_long',
  'devadminsecret_at_least_32_characters_long',
  'devkey_at_least_32_characters_long_for_aes_gcm',
]);

export type Env = z.infer<typeof envSchema>;
