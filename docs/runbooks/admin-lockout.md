# Runbook: super_admin lost access (lockout)

## Symptoms

- A `super_admin` cannot log in (lost password, lost 2FA device, recovery codes exhausted).
- No other `super_admin` exists to reset them via the UI.

## Severity

**P1** if it blocks an active incident; **P2** otherwise. Schedule the
recovery during business hours with two operators present.

## Decision tree

```
Is there ANOTHER super_admin alive?
├─ yes → use UI reset (admin-operations.md). Done.
└─ no  → SQL recovery (this runbook), two-person rule.
```

## SQL recovery (two-person rule)

This procedure intentionally requires database access AND a witness. The
witness reads the SQL aloud before it runs and signs off in the
incident channel.

1. Both operators are present (in person or on video). Witness opens
   the audit log query in another window:
   ```sql
   SELECT created_at, actor_id, action, metadata
   FROM audit.audit_logs
   ORDER BY id DESC LIMIT 50;
   ```
2. Connect as `lp_owner` (DDL/admin role; see secrets vault):
   ```sh
   psql "$LP_OWNER_URL"
   ```
3. Compute a fresh password hash. Use Argon2 in a Node REPL on a
   secured laptop:
   ```sh
   node -e "import('argon2').then(a => a.default.hash('NEW_TEMP_PASSWORD').then(console.log))"
   ```
   The string starts with `$argon2id$...`.
4. Reset the locked admin (replace placeholders):

   ```sql
   BEGIN;
   UPDATE auth.users
      SET password_hash = '$argon2id$...',
          totp_secret_enc = NULL,
          totp_verified_at = NULL,
          recovery_codes_hash = NULL,
          must_change_password = true,
          suspended_at = NULL
    WHERE email = 'super_admin_email@lp.local'
      AND user_type = 'admin_user'
      AND admin_role = 'super_admin';
   -- 1 row should be affected.

   -- Manual audit entry — the UI normally writes this; here we do it by hand.
   INSERT INTO audit.audit_logs
     (audit_id, actor_type, actor_id, action, resource_type, resource_id, outcome, metadata)
   VALUES (
     gen_random_uuid()::text, -- or any unique id
     'system',
     'sql-recovery',
     'admin_user.force_reset.sql',
     'admin_user',
     'super_admin_email@lp.local',
     'success',
     jsonb_build_object(
       'reason',  'lockout-recovery',
       'witness', 'witness_admin_email_or_id',
       'incident', 'INC-NNNN'
     )
   );
   COMMIT;
   ```

5. Locked admin logs in with `NEW_TEMP_PASSWORD`, is forced to change it,
   then re-runs 2FA setup.
6. Witness writes a 1-paragraph incident summary to the security channel.

## Postmortem

Within 5 business days. Mandatory questions:

- Why were recovery codes unavailable?
- Why was there only one `super_admin`? (Org policy: at least two.)
- Did the SQL recovery procedure work as documented? Update if not.
