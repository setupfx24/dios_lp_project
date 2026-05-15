# Incident: trade hash chain broken

## Symptoms

- `apps/workers` chain-verifier alert fires (look for `chain-verifier: integrity violation`).
- CI nightly job `verify-chain` exits non-zero.
- Manual run reports `PREV_HASH_MISMATCH` or `HASH_MISMATCH`:
  ```sh
  pnpm tsx infra/scripts/verify-chain.ts <brokerId>
  ```

## Severity

**P0** if a customer-facing trade can no longer be proven authoritative.
**P1** if the break is in archived data older than reporting window.

## Triage (10 minutes)

1. Capture current state — take a `pg_dump` snapshot of `trading.trades` for
   the affected broker(s):
   ```sh
   pg_dump $DATABASE_URL --schema=trading --table='trades' --data-only \
     | gzip > trades-broker-<id>-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
   ```
2. Identify the first failing row from `verify-chain` output. Note its
   `id`, `trade_id`, `executed_at`.
3. Check the audit log for any unusual `INSERT` traffic around that time:
   ```sql
   SELECT * FROM audit.audit_logs
   WHERE created_at BETWEEN '<window>' AND '<window>'
     AND resource_type = 'trade'
   ORDER BY created_at;
   ```
4. Check if the trigger fired but was ignored (it shouldn't be):
   ```sh
   psql $DATABASE_URL -c "SELECT tgname, tgrelid::regclass FROM pg_trigger \
     WHERE tgname LIKE 'trg_%_block_mutations'"
   ```
   You should see triggers on `trading.trades`, `ledger.ledger_entries`,
   `audit.audit_logs`. Missing trigger = re-apply
   `apps/api/src/database/migrations/security/0001_security.sql` immediately.

## Investigate

The break is **never** "fix it in place." Possible causes, ordered by
likelihood:

1. **Application bug**: a code path inserted a trade without going through
   `TradesService.recordTrade` / `OrderProcessor.recordFill`. Search for
   `INSERT INTO trading.trades`:
   ```sh
   grep -rn "INSERT INTO trading.trades" apps/ infra/
   ```
   The only legitimate sites are the two service classes plus the seed
   script and e2e tests.
2. **Privilege escalation**: someone connected as `lp_owner` (or another
   role with mutate rights) and ran a manual SQL fix. Check Postgres logs
   for non-`lp_app` connection sources.
3. **Race condition**: extremely unlikely under SERIALIZABLE isolation, but
   if two workers picked the same prev-hash on a network partition, you'd
   see a duplicate `prev_hash` for the same broker.

## Repair

**Never** `UPDATE` or `DELETE` on `trading.trades`. The repair pattern:

1. Insert a _reversal_ trade for any erroneous fill: opposite side, same
   quantity & price, with a `description` referencing the original `trade_id`.
2. Re-record the correct fill via the standard service path. Its
   `prev_hash` will chain off the reversal.
3. Document the incident in the audit log via an `INSERT` to
   `audit.audit_logs` with `action = 'chain.repair'`, including the original
   trade ID and the reversal trade ID in `metadata`.

## Verify

```sh
pnpm tsx infra/scripts/verify-chain.ts <brokerId>   # exits 0
```

Add the broker to a watch list so the next chain-verifier run double-checks.

## Postmortem

- File a postmortem within 5 business days.
- Patch the root cause in code.
- Add a regression test (typically in `apps/api/test/e2e/`) that exercises
  the scenario.
