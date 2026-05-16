# @lp/core

Shared action handlers that both `apps/api` and `apps/workers` invoke.

## Why

Below-threshold admin actions execute synchronously inside the API request
(via the audit-in-tx interceptor). Above-threshold actions queue in
`admin.pending_actions` and are executed asynchronously by
`apps/workers/.../approval-watcher.ts` after a second admin approves.

Both paths must produce identical ledger / state effects — the safest way
to ensure that is to call the SAME code from both places. `apps/api` can't
import from `apps/workers` (forbidden by ESLint) and vice versa; the
extraction here is the proper home.

## Architecture

- **`ledger-ops.ts`** — `LedgerOps` interface. Two implementations live
  outside this package:
  - `apps/api` builds a Drizzle adapter from its `LedgerRepository`.
  - `apps/workers` builds a raw `pg.Pool` adapter.
- **`actions/wallet-adjust.ts`** — pure handler over `LedgerOps`. No
  Drizzle, no pg, no Nest.
- **`dispatcher.ts`** — `dispatch(action, ops)` routes by `action.type`.
  Caller owns the transactional boundary.

## Adding a new action

1. Add a new payload type and handler under `actions/`.
2. Extend `PendingActionType` and the `switch` in `dispatcher.ts`.
3. Add unit tests in `<action>.test.ts` with a fake `LedgerOps`.
4. Update the apps that need to call the new action.
