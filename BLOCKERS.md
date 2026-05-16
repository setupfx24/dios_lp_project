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

### B-002 — Dispatcher logic duplicated between api and workers stub

**Symptom.** `apps/api/.../interventions.controller.ts` executes the
below-threshold wallet-adjust path inline. `apps/workers/.../approval-watcher.ts`
_marks_ approved actions as executed but the actual dispatch is a stub.

**Root cause.** Avoiding cross-app imports without first extracting a
shared package.

**Risk.** The above-threshold path (after admin approval) currently
performs no state change. Below-threshold and post-approval-execute
paths cannot diverge silently if they share code.

**Next action.** Task 8.2 — create `packages/core` with a typed
`dispatch(action)` consumed by both call sites. Unit tests in
`packages/core`; e2e in 8.1.7.

**Owner.** Current session.

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

### B-005 — Admin E2E tests not yet run end-to-end

**Symptom.** All 7 admin e2e test files added in 8.1 are typecheck +
lint clean but `pnpm --filter @lp/api test:e2e` has not been executed
in this session (no Docker on the dev host).

**Risk.** Authored tests can have subtle issues that only surface on
first run: shared-state between specs that all use the same
`startE2EApp()` helper, fixture cleanup, Fastify cookie path matching
against `/api/v1/admin` prefix in the helper, etc.

**Next action.** Run `pnpm --filter @lp/api test:e2e` on a
Docker-equipped host; fix surface-level issues; mark resolved.

**Owner.** Operator / next session with Docker access.

---

### B-004 — Cannot exercise `docker compose up` end-to-end on Windows host

**Symptom.** Live stack startup not validated this session.

**Root cause.** Docker Desktop not running on the dev machine; out of
scope for the code work.

**Risk.** Low — compose file is structurally correct and follows the
pattern that worked in prior projects. But a build-time failure in any
of the four Dockerfiles wouldn't surface until first deploy.

**Next action.** Out of scope of Phase 8. Re-validate on a CI runner or
a machine with Docker Desktop.

**Owner.** Operator (defer).

## Resolved

(none yet)
