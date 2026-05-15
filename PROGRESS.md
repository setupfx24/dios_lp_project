# Progress

> Live tracking. Append-only at the section level (don't rewrite history; mark
> entries done with `[x]` and add new entries underneath).

## Phases

- [x] **Phase 1 — Foundation** — workspace, turbo, tsconfig, husky, configs
- [x] **Phase 2 — Shared packages** — `@lp/{types,constants,utils,validators,sdk}` (75 + 9 tests)
- [x] **Phase 3 — Backend `apps/api`** — NestJS+Fastify, Drizzle schemas across 5 Postgres namespaces, hand-written security migration (roles + REVOKE + triggers + TimescaleDB), Pino, Swagger, all 13 modules, testcontainers e2e for the trade hash chain (12 tests)
- [x] **Phase 4 — Frontend** — `apps/web` (broker dashboard) + `apps/admin` (LP operator panel — initial stub, later replaced)
- [x] **Phase 5 — Workers** — BullMQ order processor, settlement, chain-verifier, audit-archive
- [x] **Phase 6 — Infrastructure** — docker-compose, postgres-init roles, seed/verify-chain scripts, CI / Docker / CodeQL workflows
- [x] **Phase 7 — Documentation** — README, architecture, database, security, 5 ADRs, 3 runbooks
- [x] **Phase A — Backend admin extension** — `ROUTES_ENABLED`, admin schema, TOTP 2FA, reauth, 4-eyes (`pending_actions`), audit-in-tx interceptor, route prefix migration to `/api/v1/broker/*` and `/api/v1/admin/*`
- [x] **Phase B — Admin frontend** — full Next.js 14 admin app with red/orange theme, 2FA setup wizard, recovery codes, reauth modal, approvals, interventions, operations
- [x] **Phase C — SDK + web prefix update** — `LpClient` updated to `/api/v1/broker/*`, new `AdminClient` for `/api/v1/admin/*`
- [x] **Phase D — Workers admin extension** — `ApprovalWatcher` polls `pending_actions.status='approved'`, expires stale (24h)
- [x] **Phase E — Infra updates** — admin env keys in compose, super-admin seeded
- [x] **Phase F — Documentation** — ADR-0006, ADR-0007, deployment.md, admin-operations.md, admin-lockout + compromised-admin-account runbooks
- [ ] **Phase 8 — Gap closure** (in progress, see backlog below)

## Counts

- 9 workspace projects (5 packages, 4 apps)
- 109 unit tests passing (utils 88, validators 9, api 12)
- 1 e2e test file (`apps/api/test/e2e/trades-chain.e2e-spec.ts`) — chain integrity + lp_app trigger enforcement
- Admin app: 11 routes (login, two-factor, recovery, operations, brokers, interventions, approvals, audit, users, /, \_not-found)
- Web app: 5 routes

## Phase 8 — Gap closure (backlog)

**Priority 1** (production blockers):

- [ ] **8.1 Admin E2E tests** — 8–10 files in `apps/api/test/e2e/admin/` using existing `testcontainers.ts`:
  - 8.1.1 2FA setup + verify happy path
  - 8.1.2 2FA verify with wrong code → rejected
  - 8.1.3 Audit-in-tx atomicity: force audit insert failure → state change rolled back
  - 8.1.4 4-eyes self-approval rejected at all three layers (app, SQL, CHECK)
  - 8.1.5 Wallet adjustment below threshold → executes immediately
  - 8.1.6 Wallet adjustment above threshold → queues for approval
  - 8.1.7 Approved action → executes via worker dispatcher
  - 8.1.8 Admin session idle 15+ min → next request rejected
  - 8.1.9 Broker JWT cookie sent to `/api/v1/admin/*` → rejected (cross-cookie isolation)
- [ ] **8.2 Dispatcher extraction → `packages/core`** — single `dispatch(action)` consumed by both `apps/api` (synchronous below-threshold path) and `apps/workers` `ApprovalWatcher` (async post-approval). Unit tests in `packages/core`.

**Priority 2** (next sprint):

- [ ] **8.3 Audit JSONB diff viewer** — render `before_state` / `after_state` side-by-side in `apps/admin/audit`. Filters: actor / action / date / broker. CSV export with filters applied.

**Out-of-scope, tracked but not committed to this iteration:**

- TOTP secret rotation migration (re-encrypt under new `TOTP_ENCRYPTION_KEY`).
- `packages/ui` extraction to share UI primitives between web and admin (currently duplicated; documented in ADR-0006).

## Sessions

- **2026-05-15 (prior)** — Phases 1–F. End-of-session summary archived in `docs/sessions/2026-05-15-summary.md`.
- **2026-05-15 (current)** — Phase 8 gap closure. Bootstrapped tracking docs from prior summary; baseline commit; beginning 8.1.
