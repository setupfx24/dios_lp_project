# ledger module

Double-entry accounting. Every trade produces an atomic
DEBIT + CREDIT pair on `ledger_entries`. The wallet balance is computed by
summing `(direction == 'CREDIT' ? +amount : -amount)` across the wallet's
entries — no `wallets.balance` column to drift out of sync.

## Append-only

Same enforcement as `trades`:

- repository exposes only `insert*` and `find*`,
- runtime role lacks `UPDATE`/`DELETE` grants,
- `BEFORE UPDATE OR DELETE` trigger raises an exception.

Corrections are an _adjustment_ entry referencing the original.
