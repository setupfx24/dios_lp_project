# TODO — deferred work from the security-hardening sweep

Items below were intentionally **NOT** fixed in the PHASE 1 + B1-B6 + MF6
sweep. Each is either a major-version bump (needs a dedicated upgrade
window) or operator infrastructure that can't be expressed in this repo.

Track this file in PRs that touch the relevant area. Each entry has a
**Risk** rating (impact × likelihood) and a recommended **Target** window.

---

## Major-version upgrades (security-relevant) — deferred from B4

These advisories cannot be closed inside the current major. Each is a coordinated
upgrade that needs a test branch + manual smoke against the staging env.

| Pkg                                                                                                                         | Current | Required for fix                                                                                                                                                                                                                                                   | Risk                                              | Target window                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| **`next`**                                                                                                                  | 14.2.35 | **15.x** for: DoS via Server Components deserialization (HIGH, GHSA-XXX); DoS via Image Optimizer remotePatterns (MODERATE); HTTP-request smuggling in rewrites (MODERATE); Unbounded `next/image` cache (MODERATE); cache-poisoning in middleware redirects (LOW) | **HIGH**                                          | Next sprint — major because of App Router defaults + RSC behaviour changes     |
| **`@nestjs/platform-fastify`**                                                                                              | 10.4.16 | **11.1.10+** for: URL-encoding bypass (HIGH, TOCTOU); HEAD-request middleware bypass (HIGH)                                                                                                                                                                        | **HIGH**                                          | Coordinated Nest 10→11 bump — see below                                        |
| **`@nestjs/{common,core,jwt,bullmq,event-emitter,config,schedule,swagger,websockets,platform-socket.io,platform-fastify}`** | 10.4.x  | **11.x**                                                                                                                                                                                                                                                           | MEDIUM (decorator-API + middleware shape changes) | Bundle with Fastify 5 → see below                                              |
| **`fastify`**                                                                                                               | 4.28.1  | **5.7.2+** for: Content-Type header tab-char body-validation bypass (HIGH); X-Forwarded-Proto/Host spoofing (MODERATE); sendWebStream memory DoS (LOW)                                                                                                             | **HIGH**                                          | Bundled with Nest 11 — Fastify 5 is the Nest-11 peer                           |
| **`drizzle-orm`**                                                                                                           | 0.34.1  | Fixed-in version (HIGH SQL injection via identifier escaping) — check the advisory before bumping; drizzle's 0.x bumps are functionally majors                                                                                                                     | **HIGH**                                          | Bump + test all repository.ts queries that use raw `sql\`\`` template literals |

**Suggested order**: drizzle first (smallest surface, biggest exposure) →
Nest 11 + Fastify 5 (bundled) → Next 15 last (most disruptive to the
admin + web Next apps).

---

## Single-major bumps available but deferred (PHASE 2)

Same-major minor/patch bumps that pnpm-outdated reported. These are LOW-risk
and can be taken in one PR after the security work lands.

- `@tanstack/react-query` 5.59.0 → 5.100.x (~40 minors behind, no breaking)
- `bullmq` 5.13.2 → 5.76.x
- `ioredis` 5.4.1 → 5.10.x
- `pg` 8.13.0 → 8.21.x
- `nestjs-pino` 4.1.0 → 4.6.x
- `react-hook-form` 7.53.0 → 7.76.x
- `lightweight-charts` 4.2.1 (stays in 4.x; 5.x = visual-redesign major)
- `tsx`, `vitest`, `turbo` — dev tools, safe minor bumps

---

## Operator infrastructure (cannot be fixed in repo)

| #     | Item                                   | Why it matters                                                                                                                           | Owner action                                                                                                      |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| OPS-1 | HTTPS termination                      | API + admin + web speak plain HTTP. JWTs and HMAC secrets travel in cleartext without TLS in front.                                      | Stand up Nginx / Traefik / CloudFlare. Forward `X-Forwarded-{Proto,For,Host}` and enable `trustProxy` in Fastify. |
| OPS-2 | Postgres backups                       | `docker-compose.yml` mounts a volume but schedules no backup. First disk failure = full data loss.                                       | Add `pg_dump` cron, off-host snapshots, or managed Postgres.                                                      |
| OPS-3 | Secrets management                     | Secrets currently live in plaintext `.env` files on disk.                                                                                | Pipe through Vault / SOPS / cloud Secret Manager. Never commit prod `.env`.                                       |
| OPS-4 | Web Application Firewall               | No rate-limiting in front of the API beyond our app-level throttler.                                                                     | Cloudflare / AWS WAF / similar in front.                                                                          |
| OPS-5 | Per-broker throttler                   | Current ThrottlerGuard keys on `request.ip`. If multiple brokers share an LB IP they can DoS each other.                                 | Replace with a `brokerId`-keyed guard or use Redis-backed `ThrottlerStorage` + custom key.                        |
| OPS-6 | Multi-instance API throttler           | In-memory throttler doesn't share state across instances. An attacker who rotates IPs across LB targets bypasses the limit.              | Install `@nest-lab/throttler-storage-redis` and switch to Redis storage.                                          |
| OPS-7 | Admin app build trace error on Windows | `next build` fails the trace-collection step on Windows for `.next/server/app/_not-found/page.js.nft.json`. Linux Docker builds succeed. | If you must build on Windows, use WSL2; CI / Dockerfile both run on Linux and are unaffected.                     |

---

## Security gaps still open from PHASE 0 ASSESSMENT (PHASE 1 / 3 / 6 / 7)

Tracked here so we don't lose them when the user moves to the next phase.

### From PHASE 1 (audit)

- Path params not Zod-validated (`:userId`, `:brokerId`, `:apiKeyId`,
  `:actionId` in every admin controller) — relies on DB existence checks
  for safety. Add a `ParseZodPathParamPipe` and apply globally.
- `trades.controller.ts` uses manual `user.role === 'lp_admin'` checks
  instead of the `@RequireAdminRole`/`AdminRoleGuard` decorator pattern
  used everywhere else. Inconsistency, no functional gap, but worth a
  cleanup PR.
- Audit-query `from`/`to` date params not enforced ISO-8601.
- No CSRF tokens — currently relying on SameSite=strict cookies.
  Document this decision in an ADR if we keep it.

### From PHASE 3 (scalability)

- Unpaginated `brokers` list endpoint at
  `apps/api/src/modules/admin/brokers-admin/brokers-admin.controller.ts:92`.
- Unpaginated `ledgerEntries` SELECT at `apps/api/src/modules/ledger/ledger.repository.ts:77-78`.
- Parallelise 4 sequential COUNT queries in `dependents` endpoint with
  `Promise.all`.

### From PHASE 6 (testing)

- Zero unit specs in 12 of 14 API modules (only `charges` and `risk`
  have specs). Priority order: `orders` → `matching` → `trades` →
  `hmac` → `admin/*` → `audit` → `ledger` → workers processors.
- Zero frontend specs in `@lp/admin` and `@lp/web` (Vitest configured
  but `--passWithNoTests`).
- No E2E for the broker-order happy path (HMAC sign → POST /orders →
  match → trade → charges → audit).
- No browser E2E (Playwright / Cypress).

### From PHASE 7 (observability)

- No error tracking (Sentry).
- No metrics (`prom-client`).
- No tracing (OpenTelemetry).
- No `/ready` separate from `/health` for k8s.

### From PHASE 8 (docs)

- Per-app READMEs missing for `apps/{api,admin,web,workers}`.
- Runbooks `rotate-api-key`, `db-failover`, `ws-disconnect`,
  `secret-rotation`, `incident-response` not yet written.
- `.github/ISSUE_TEMPLATE/*` missing.

---

## Out-of-scope items intentionally NOT in this sweep

- Three brokers in the dev DB (`demo-broker-1`, `dios-broker-1`,
  `dios`) — the user still has to decide whether to delete
  `dios-broker-1` (would break the DIOS integration).
- The `dios/` legacy stack (Express+Mongoose) is not part of the
  Dios_Lp deploy and was not touched.
- `corecen_production/` (the older CoreCen LP) is not part of the
  Dios_Lp deploy and was not touched.

Once these are dispositioned, this section can be deleted.

---

_Last updated: 2026-05-26 during the security-hardening sweep
(C5, H5, H6, H7, M2, M5, B1-B6, MF6)._
