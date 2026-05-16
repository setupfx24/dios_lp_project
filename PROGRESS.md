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

- 10 workspace projects (6 packages, 4 apps)
- 120 unit tests passing (utils 88, validators 9, core 11, api 12)
- 1 e2e test file (`apps/api/test/e2e/trades-chain.e2e-spec.ts`) — chain integrity + lp_app trigger enforcement
- Admin app: 11 routes (login, two-factor, recovery, operations, brokers, interventions, approvals, audit, users, /, \_not-found)
- Web app: 5 routes

## Phase 8 — Gap closure (backlog)

**Priority 1** (production blockers):

- [x] **8.1 Admin E2E tests** — files in `apps/api/test/e2e/admin/` using `testcontainers.ts`:
  - [x] 8.1.0 Hand-written `0000_init.sql` migration (drizzle-kit blocked by .js imports — see ADR-0005). Unblocks ALL e2e work.
  - [x] 8.1.1 2FA setup + verify happy path (`admin-2fa-setup.e2e-spec.ts`)
  - [x] 8.1.2 2FA verify with wrong code → rejected (`admin-2fa-wrong-code.e2e-spec.ts`)
  - [x] 8.1.3 Audit-in-tx atomicity (`admin-audit-in-tx.e2e-spec.ts`)
  - [x] 8.1.4 4-eyes self-approval rejected at all three layers (`admin-4eyes-self-approval.e2e-spec.ts`)
  - [x] 8.1.5 + 8.1.6 Wallet adjust threshold routing (`admin-wallet-adjust-threshold.e2e-spec.ts`)
  - [x] 8.1.7 Approved action → executes via worker dispatcher (`apps/workers/test/e2e/approval-watcher.e2e-spec.ts`) — completed as part of 8.2
  - [x] 8.1.8 Admin session idle 15+ min → rejected (`admin-idle-timeout.e2e-spec.ts`)
  - [x] 8.1.9 Broker cookie → admin endpoint rejected (`admin-cookie-isolation.e2e-spec.ts`)
  - Helpers: `test/helpers/e2e-app.ts`, Redis-enabled `test/helpers/testcontainers.ts`, `test/helpers/fixtures.ts`
  - **Caveat: not executed end-to-end this session.** Typecheck + lint clean. Requires Docker to run via `pnpm --filter @lp/api test:e2e`.
- [x] **8.2 Dispatcher extraction → `packages/core`**
  - `LedgerOps` interface in `packages/core/src/ledger-ops.ts` — small port for ledger writes; no Drizzle / no pg leaks into action handlers.
  - `executeWalletAdjust(payload, ops)` — single source of truth for wallet-adjust execution.
  - `dispatch(action, ops)` — routes pending actions to handlers, returns tagged union.
  - 11 unit tests in `packages/core` (6 wallet-adjust, 5 dispatcher with placeholder action types).
  - `apps/api`: `InterventionsController.walletAdjust` now calls `executeWalletAdjust` via a new `drizzleLedgerOps(repo, tx)` adapter — no more duplicated ledger code.
  - `apps/workers`: `ApprovalWatcher` now genuinely dispatches approved actions inside its own transaction via `pgLedgerOps(client)`, with success/failure audit rows.
  - 8.1.7 added at `apps/workers/test/e2e/approval-watcher.e2e-spec.ts` (3 tests covering approved→executed, no-op re-poll, and stale expiry).
  - **Caveat:** the e2e file is typecheck + lint clean but Docker-dependent; not executed this session.

**Priority 2** (next sprint):

- [x] **8.3 Audit JSONB diff viewer**
  - New `AdminClient.listAudit(query)` with full typed envelope (incl. bigint → string coercion).
  - `apps/api AuditQueryController` now projects explicit columns and casts `id: bigint → string`, `createdAt: Date → ISO` at the JSON boundary — would have thrown on `JSON.stringify(bigint)` otherwise.
  - `apps/admin/src/features/audit/json-diff.tsx` — custom side-by-side recursive diff renderer (no extra dep). Handles primitives, arrays, objects, added/removed keys; coloring via Tailwind.
  - `apps/admin/src/app/(admin)/audit/page.tsx` — filter form (actor / action / resourceType / from / to / limit), TanStack Query, table with expandable rows, JSON-diff for before/after, CSV export of currently-loaded rows.
  - `/audit` bundle: 145 B (stub) → 5.11 kB (full viewer).

**Out-of-scope, tracked but not committed to this iteration:**

- TOTP secret rotation migration (re-encrypt under new `TOTP_ENCRYPTION_KEY`).
- `packages/ui` extraction to share UI primitives between web and admin (currently duplicated; documented in ADR-0006).

## Sessions

- **2026-05-15 (prior)** — Phases 1–F. End-of-session summary archived in `docs/sessions/2026-05-15-summary.md`.
- **2026-05-15 (current)** — Phase 8 gap closure. Bootstrapped tracking docs from prior summary; baseline commit; beginning 8.1.
- **2026-05-16** — Completed 8.1 (admin e2e tests, 7 files for 8 of 9 concerns). 8.1.7 deferred to after 8.2. Also fixed pre-commit hook (memory + flat-config-discovery bugs) and added `0000_init.sql` migration.
- **2026-05-16 (cont.)** — Completed 8.2 (packages/core dispatcher + ledger-ops port). 11 unit tests. api InterventionsController + workers ApprovalWatcher both call the same `executeWalletAdjust`. Added 8.1.7 e2e (`apps/workers/test/e2e/approval-watcher.e2e-spec.ts`).
- **2026-05-16 (cont.)** — Completed 8.3 (audit JSONB diff viewer + filters + CSV). Fixed a latent bug in `AuditQueryController` (bigint id would have crashed JSON.stringify).
