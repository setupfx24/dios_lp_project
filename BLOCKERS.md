# Blockers

> Open issues that gate production. Each entry: **symptom → root cause →
> next action → owner**. Closed entries move to the bottom under
> "Resolved".

## Open

### B-001 — No admin-flow E2E coverage

**Symptom.** Backend admin module (`AdminJwtGuard`, `TotpVerifiedGuard`,
`ReauthGuard`, `AdminRoleGuard`, `AuditLogInterceptor`, 4-eyes self-approval
checks) has no integration tests. Unit tests cover charges and risk only.

**Root cause.** Phase A focused on building the surface; e2e was deferred.

**Risk.** A guard regression (e.g., a future PR loosening a check) could
ship without detection. Audit-in-tx atomicity (action + audit rollback
together) is structurally correct but unverified end-to-end.

**Next action.** Task 8.1 — write 8–10 e2e files using existing
`testcontainers.ts`. Each file is one concern.

**Owner.** Current session.

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
