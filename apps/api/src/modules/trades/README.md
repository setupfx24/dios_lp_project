# trades module

Append-only trade record. **Three layers of immutability enforcement:**

1. **Repository API surface.** `TradesRepository` only exposes `insert`,
   `findByBroker`, `findById`, `getLastHash`. There is intentionally no
   `update` or `delete` method. Adding one is a code-review red flag.

2. **Postgres role grants.** Runtime user `lp_app` has only
   `SELECT, INSERT` on `trading.trades`. `UPDATE` and `DELETE` are
   `REVOKE`d in `0001_security.sql`.

3. **Trigger.** A `BEFORE UPDATE OR DELETE` trigger on `trading.trades`
   raises `exception 'Append-only table'`. Even if a future migration
   accidentally re-grants `UPDATE`, this trigger blocks it.

## Hash chain

Each trade carries `prev_hash` (hex SHA-256 of the prior trade in the same
broker's chain) and `hash` (SHA-256 of `prev_hash || canonical(record)`).
Computed in application code (`@lp/utils/hash-chain`) **inside the same
transaction as the insert**, so concurrent inserts can't race the chain.

The first trade per broker uses `GENESIS_HASH = '0' * 64` as `prevHash`.

Verified end-to-end nightly by `apps/workers/.../chain-verifier.processor.ts`
and on demand via `infra/scripts/verify-chain.ts`.

## Correcting an erroneous trade

Never `UPDATE`. Insert a _reversal_ trade in the opposite direction with
the same quantity and price, plus a description referencing the original
`tradeId`. The chain stays intact; the audit log records the correction.
