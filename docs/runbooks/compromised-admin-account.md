# Runbook: compromised admin account

## Symptoms

Any of:

- Admin reports their device or password was stolen.
- Audit log shows admin actions the user disclaims.
- A 4-eyes approval was bypassed (CHECK constraint violation in logs).
- TOTP code being reused (otplib's window catches one-time replay; if you
  see consistent failures from a known IP, treat as compromise).

## Severity

**P0**.

## Immediate (≤ 5 min)

1. Suspend the user via UI: Admin users → suspend. This sets
   `auth.users.suspended_at`; subsequent requests fail at `AdminJwtGuard`.
2. Revoke their active sessions:
   ```sql
   UPDATE auth.admin_sessions
      SET revoked_at = now()
    WHERE user_id = '<userId>'
      AND revoked_at IS NULL;
   ```
3. Notify the security channel with subject `[P0] Admin compromise`.

## Triage (≤ 30 min)

1. Pull the actor's recent activity:
   ```sql
   SELECT created_at, action, resource_type, resource_id, outcome,
          ip_address, user_agent, metadata
   FROM audit.audit_logs
   WHERE actor_id = '<userId>'
   ORDER BY id DESC
   LIMIT 1000;
   ```
2. Tag any state-changing actions for review (`wallet.adjust`,
   `trade.reverse`, `broker.suspend`, `charges.rate.update`, anything
   under `admin_user.*`).
3. Cross-reference IPs against known operator infrastructure. Anything
   from an unexpected geo / ASN is evidence.
4. Check for new `admin_user.create` rows: an attacker may have created
   a backdoor admin. List with:
   ```sql
   SELECT user_id, email, admin_role, created_at FROM auth.users
   WHERE user_type = 'admin_user' AND created_at > now() - interval '90 days';
   ```

## Containment

- If wallet adjustments or trade reversals were performed by the
  compromised account: insert reversal entries (see
  [admin-operations.md](../admin-operations.md)) AFTER the security
  team approves.
- If you suspect `ADMIN_JWT_SECRET` or `TOTP_ENCRYPTION_KEY` leaked
  (admin's laptop with `.env` accessed): rotate both, then re-encrypt
  every `users.totp_secret_enc` under the new key. This forces every
  admin to re-run 2FA setup.

## Recovery

1. Once incident is closed: super_admin force-resets the compromised
   admin's password and 2FA.
2. The user runs through fresh 2FA setup, copies new recovery codes.
3. Re-enable account.
4. File a postmortem within 24 hours.

## Postmortem questions

- How did the credentials leak?
- Did our session length / reauth window limit the blast radius?
- Did the audit log capture everything? Any gaps?
- Can we add a detection rule for the indicator that surfaced this?
