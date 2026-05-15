# ADR-0007: Admin auth — TOTP 2FA + reauth + 4-eyes approval

- Status: accepted
- Date: 2026-05-15

## Context

Admin actions (broker suspend, wallet adjust, charge rate change, trade
reversal) are high-blast-radius and high-fraud-risk. Username+password is
not sufficient. We need:

1. Strong second factor for every admin login.
2. A "fresh authentication" gate before sensitive actions, so a stolen
   active session cannot silently drain wallets.
3. Two-person rule for actions above a configurable money threshold.
4. Tamper-evident audit of every admin action, atomic with the action itself.

## Decision

### TOTP 2FA (RFC 6238)

- Library: `otplib`. 30-second period, 6 digits, default RFC parameters.
- Secret stored as AES-256-GCM ciphertext (`auth.users.totp_secret_enc`),
  encrypted with `TOTP_ENCRYPTION_KEY` from the secret manager.
- Recovery: 10 single-use codes (16 hex chars each) generated at setup,
  Argon2-hashed at rest. User must copy them once at setup. Used codes
  are removed from the array via `array_remove` so a leaked DB dump
  does not reveal which codes are still valid.
- Force-reset: only `super_admin` can clear another admin's TOTP. The
  endpoint requires reauth and writes an audit row.

### Reauth window

- Sensitive endpoints carry `@RequireReauth()`. The `ReauthGuard` checks
  for a fresh `X-Reauth-Token` header (Argon2-hashed against
  `admin_sessions.reauth_token_hash`) within the configured window
  (`ADMIN_REAUTH_WINDOW_SECONDS`, default 300s).
- The reauth token is issued by `POST /api/v1/admin/auth/reauth` after
  re-verifying the user's password.

### 4-eyes approval

- Threshold: `ADMIN_4EYES_THRESHOLD_PAISE` (default ₹10,000 = 1_000_000 paise).
- Endpoints that may exceed the threshold (wallet adjust, charge-rate
  change, trade reversal) compute the magnitude. If above threshold,
  the action is written to `admin.pending_actions` instead of executing,
  and a second admin must approve.
- Self-approval is rejected at THREE layers:
  1. Application: `if (before.requestedBy === ctx.user.userId) throw`
  2. SQL: `WHERE requestedBy <> approverId` in the UPDATE
  3. DB constraint: `CHECK (approved_by IS NULL OR approved_by <> requested_by)`

### Audit-in-transaction

- Every admin endpoint tagged with `@AuditLog('action.name')` runs inside
  a Drizzle transaction. The `AuditLogInterceptor` opens the tx, places
  it on `req.adminCtx.tx`, runs the controller, and writes the audit row
  inside the same tx. Repos that take `tx?: Db` automatically participate.
- Atomicity: action and audit succeed or fail together. If the DB rejects
  the audit insert, the action rolls back. If the controller throws, the
  audit row also rolls back (a `failure`-flagged audit is attempted
  but rolled back with the rest).
- The intent: there is **no possible consistent state where an action
  succeeded without an audit row**.

## Alternatives considered

- **WebAuthn / passkeys** instead of TOTP: better security, more setup
  friction. Slated for a future ADR — TOTP is the floor.
- **Reauth via OAuth-style step-up**: heavier to implement; password
  reauth is simple and clearly tied to the human at the keyboard.
- **4-eyes via two separate tokens in one request**: confusing UX. The
  pending-action queue is more explicit and gives the second admin time
  to inspect context.
- **Audit via async EventEmitter outside the tx**: lets the action
  succeed without the audit. Unacceptable.

## Consequences

- The admin frontend is non-trivial: setup wizard, TOTP code entry,
  recovery flow, reauth modal, approvals queue. Documented in
  [docs/admin-operations.md](../admin-operations.md).
- DB schema additions: `auth.users` (TOTP/recovery columns),
  `auth.admin_sessions`, `admin.pending_actions`.
- New env keys: `ADMIN_JWT_SECRET`, `TOTP_ENCRYPTION_KEY`,
  `ADMIN_REAUTH_WINDOW_SECONDS`, `ADMIN_4EYES_THRESHOLD_PAISE`,
  `ADMIN_IDLE_TIMEOUT_SECONDS`.
- TOTP secret rotation requires a re-encrypt migration (decrypt under
  old key → encrypt under new). Documented in `docs/security.md`.
