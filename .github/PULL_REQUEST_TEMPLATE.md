## Summary

<!-- One or two sentences. WHY, not just WHAT. -->

## Changes

<!-- Bullet points of the user-visible / operator-visible deltas. -->

## Test plan

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (zero warnings)
- [ ] `pnpm test` passes
- [ ] (if touching `apps/api`) `pnpm --filter @lp/api test:e2e` passes
- [ ] Manual repro of the bug / feature on a local stack

## Append-only safety

- [ ] No new code paths perform `UPDATE` or `DELETE` on `trading.trades`,
      `ledger.ledger_entries`, or `audit.audit_logs`
- [ ] Money handled via `Money` class (no JS `Number` for currency)
- [ ] If schema changed: a new Drizzle migration was generated (no edits to
      committed migrations)

## Risk

<!-- What could go wrong? Rollback plan? -->
