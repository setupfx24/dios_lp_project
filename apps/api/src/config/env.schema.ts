import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  DATABASE_URL: z.string().url().describe('postgres://user:pass@host:5432/db'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

  REDIS_URL: z.string().url().describe('redis://host:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  HMAC_REPLAY_WINDOW_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001,http://localhost:3002')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

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

  // Domain attribute for admin auth cookies. Leave unset for host-only cookies
  // (single-host deploys). When the admin UI and API live on different
  // subdomains (e.g. admin.swistrade.com + api.swistrade.com), set a parent
  // domain like ".swistrade.com" so the admin app's middleware can read the
  // cookie the API sets; otherwise the post-login redirect bounces to /login.
  ADMIN_COOKIE_DOMAIN: z.string().trim().min(1).optional(),

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
});

export type Env = z.infer<typeof envSchema>;
