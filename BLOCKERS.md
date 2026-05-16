# Blockers

> Open issues that gate production. Each entry: **symptom → root cause →
> next action → owner**. Closed entries move to the bottom under
> "Resolved".

## Open

### B-001 — No admin-flow E2E coverage

**Symptom (original).** Backend admin module had no integration tests.

**Resolution this session.** Added 7 e2e test files covering 8 of the 9
listed concerns (2FA setup/verify, wrong-code rejection, audit-in-tx
atomicity, 4-eyes self-approval at all three layers, threshold routing,
idle timeout, cross-cookie isolation). Also added the missing
`0000_init.sql` migration so e2e tests have tables to operate on.

**Remaining gap.** 8.1.7 (approved action → executes via worker
dispatcher) requires the dispatcher to exist — depends on B-002.
Will be added immediately after 8.2.

**Caveat.** Tests typecheck + lint clean but were NOT executed
end-to-end this session (no Docker on this dev machine). First run on a
Docker-equipped host will likely surface minor adjustments (test
isolation, fixture cleanup between specs). Tracked separately as B-005.

**Owner.** Closed pending B-002 + B-005.

---

### B-002 — Dispatcher extraction (CLOSED)

**Symptom (original).** Wallet-adjust execution was inline in
`apps/api InterventionsController`; `apps/workers ApprovalWatcher` only
marked approved rows as `executed` without performing any state change.

**Resolution.** `packages/core` created with:

- `LedgerOps` port (`packages/core/src/ledger-ops.ts`)
- `executeWalletAdjust(payload, ops)` action handler
- `dispatch(action, ops)` router with tagged-union result
- 11 unit tests

`apps/api`: `InterventionsController.walletAdjust` calls
`executeWalletAdjust` via `drizzleLedgerOps(repo, tx)`.

`apps/workers`: `ApprovalWatcher.executeOne` claims the row, calls
`dispatch(action, { ledger: pgLedgerOps(client) })`, writes a success
audit row, commits — all in one transaction. Failures roll back the
state change and emit a failure audit outside the rolled-back tx for
forensic context.

8.1.7 e2e (`apps/workers/test/e2e/approval-watcher.e2e-spec.ts`)
verifies the end-to-end approved → executed flow.

**Caveat.** E2E unverified against a live Postgres this session (still
B-005).

**Owner.** Closed.

---

### B-003 — Audit page is a stub

**Symptom.** `apps/admin/src/app/(admin)/audit/page.tsx` renders only a
description. No filters, no diff view, no CSV export.

**Root cause.** Out of scope of the admin scaffold.

**Risk.** Operators cannot use the audit log productively from the UI —
they must SQL into the DB.

**Next action.** Task 8.3 — build the diff viewer with filters and
CSV export.

**Owner.** Current session (after 8.1 and 8.2).

---

### B-005 — E2E tests not yet run end-to-end

**Symptom.** 8 e2e test files (7 in `apps/api/test/e2e/admin/` +
1 in `apps/workers/test/e2e/`) are typecheck + lint clean but neither
`pnpm --filter @lp/api test:e2e` nor `pnpm --filter @lp/workers test:e2e`
has been executed in this session (no Docker on the dev host).

**Risk.** Authored tests can have subtle issues that only surface on
first run: shared state between specs that share a `startE2EApp()`
handle, fixture cleanup, Fastify cookie path matching, etc.

**Next action.** Run both `test:e2e` targets on a Docker-equipped host;
fix surface-level issues; mark resolved.

**Owner.** Operator / next session with Docker access.

---

### B-004 — Cannot exercise `docker compose up` end-to-end on Windows host

**Symptom.** Live stack startup not validated this session.

**Root cause.** Docker Desktop not running on the dev machine; out of
scope for the code work.

**Risk.** Low — compose file is structurally correct and follows the
pattern that worked in prior projects. But a build-time failure in any
of the four Dockerfiles wouldn't surface until first deploy.

**Next action.** Update B-005 to include workers `test:e2e` too: same Docker dependency.

Out of scope of Phase 8. Re-validate on a CI runner or
a machine with Docker Desktop.

**Owner.** Operator (defer).

## Resolved

- **B-002** (2026-05-16) — Dispatcher extracted to `packages/core`; both api and workers consume the same handlers via thin LedgerOps adapters. See header above for details.
