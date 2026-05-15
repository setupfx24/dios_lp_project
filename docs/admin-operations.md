# Admin operations

Audience: LP operators using `apps/admin` (red/orange themed UI). Every
action below is audited (see `audit.audit_logs`).

## Onboarding a broker

1. Brokers → **+ New broker**. Fill profile (name, contact, KYC docs).
2. Set initial trading limits.
3. Click **Create**. The system mints an HMAC API key (prefix + secret);
   secret is shown ONCE — copy and hand to the broker via your secure
   channel. We store only the Argon2 hash.
4. Optionally: configure IP allowlist on the broker detail page.

Audit action: `broker.create` (in same tx as the broker insert).

## Adjusting a broker wallet

1. Interventions → **Wallet adjust**.
2. Select broker, direction (DEBIT/CREDIT), amount, currency, **mandatory reason**.
3. Click **Submit** → reauth modal opens → enter password.
4. **Below ₹10,000** (the `ADMIN_4EYES_THRESHOLD_PAISE` default): executes
   immediately. Two ledger entries (debit + credit) inserted in the same tx
   as the audit row.
5. **Above ₹10,000**: action is queued in `admin.pending_actions`. The
   approvals page shows it to other admins. The original requester
   **cannot** approve their own request.

## Reversing a trade

1. Interventions → **Trade reversal**. Search by trade ID.
2. Provide reason (mandatory).
3. Reauth.
4. The system inserts a reversal trade with the opposite side, same
   quantity/price, with `description` referencing the original `trade_id`.
   The hash chain stays intact (the reversal becomes the new tail).
5. Original trade row is **never** modified.

## Approving a pending action

1. Approvals → see queue.
2. Click an item → see full context: requester, amount, target, reason.
3. **Approve** (with optional comment) or **Reject** (mandatory reason).
4. If you are the requester, the approve button is hidden client-side and
   the backend rejects the call with `403 AUTH_FORBIDDEN`.

Once approved, the workers process executes the action (see
`apps/workers/src/processors/approval-watcher.ts`).

## Rotating an admin's 2FA

When an admin loses access to their authenticator app:

1. The admin uses one of their **recovery codes** (kept offline at setup).
2. If recovery codes are exhausted: another `super_admin` opens the locked
   admin's profile in **Admin users** → **Force reset 2FA** (requires
   reauth + reason). The locked admin then re-runs the 2FA setup wizard
   on next login.

If the locked admin **is** the only `super_admin`: see
[admin-lockout runbook](runbooks/admin-lockout.md).

## Compromised admin account

See [compromised-admin-account runbook](runbooks/compromised-admin-account.md).

Quick summary:

1. Suspend the user (Admin users → Suspend) — immediate effect.
2. Revoke all their active admin sessions (DB ops; runbook has the SQL).
3. Audit-trail review: filter `audit.audit_logs` by `actor_id`, last 30 days.
4. Notify security; rotate `ADMIN_JWT_SECRET` and `TOTP_ENCRYPTION_KEY`
   if you believe the secrets themselves leaked.

## Daily operator checklist

- [ ] Check **Operations** dashboard: queue depth, failed orders.
- [ ] Check **Approvals**: any pending > 4 hours? Reach out to requester.
- [ ] Skim **Audit** for any unfamiliar action types or unusual actors.
- [ ] Verify last night's `chain-verifier` job exited 0 (workers logs).
