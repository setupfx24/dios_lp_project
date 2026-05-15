# Security model

## Threat model summary

| Threat                               | Mitigation                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Forged order from outside            | HMAC-SHA256 over body+timestamp+request line; 30s replay window         |
| Replayed order                       | Stale-timestamp rejection; idempotency via `clientOrderId` per broker   |
| Stolen broker secret                 | Argon2id-hashed secrets; revocation via `api_keys.revoked_at`           |
| Insider tampering with trade history | Three-layer append-only (repo, role grants, trigger) + hash chain audit |
| SQL injection                        | Parameterized queries via Drizzle / `pg`; no string concatenation       |
| XSS in dashboard                     | React escapes by default; CSP via `@fastify/helmet`                     |
| Session hijacking                    | JWT in httpOnly secure cookie, SameSite=strict, 15-minute expiry        |
| Credential stuffing                  | Argon2id (memory-hard); audit log captures failed logins                |
| Cross-broker data leak               | Trades controller scopes `brokerId` from JWT for `broker_user` role     |
| Forgotten secret in source           | Zod-validated env at boot; `.env` in `.gitignore`; CI dependency audit  |

## HMAC scheme

```
signature = HMAC-SHA256(
  secret,
  timestamp + "\n" + (method + " " + path) + "\n" + body
)
```

Headers:

- `X-Api-Key: <prefix>.<secret>` — prefix is the lookup key; secret is verified against `argon2(secret_hash)` AND used as the HMAC key
- `X-Timestamp: <epoch-ms or ISO-8601>` — must be within ±30s of server time
- `X-Signature: <hex>` — 64-char hex, compared with `crypto.timingSafeEqual`

Rejection codes (see [@lp/constants](../packages/constants/src/error-codes.ts)):
`HMAC_INVALID_SIGNATURE`, `HMAC_TIMESTAMP_SKEW`, `HMAC_REPLAYED`,
`HMAC_UNKNOWN_KEY`, `HMAC_KEY_REVOKED`. All rejections are audited.

## JWT scheme

- Algorithm: HS256
- Lifetime: 15 minutes (access) / 7 days (refresh)
- Cookie: `lp_access` httpOnly, secure (in prod), SameSite=strict
- Roles: `broker_user`, `lp_admin`, `lp_operator`, `lp_readonly` — enforced
  by `@Roles(...)` decorator and `JwtGuard`.

## Secret rotation

1. Generate a new secret (Argon2 hash for API keys; raw for JWT).
2. Insert the new key alongside the old (broker can rotate without downtime).
3. Mark old `revoked_at` once the broker confirms migration.
4. JWT secret rotation requires a deploy with both secrets accepted briefly,
   then a cleanup deploy that drops the old one (handled by your secret
   manager + a graceful key-rollover routine).

## Vulnerability reporting

See [SECURITY.md](../SECURITY.md).
