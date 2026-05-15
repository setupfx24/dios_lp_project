# ADR-0004: Hash-chained trades

- Status: accepted
- Date: 2026-05-15

## Context

Append-only DB constraints (REVOKE + trigger) prevent in-place mutation, but
they don't detect **insertion of forged historical rows** if an attacker has
DB write access. We want a tamper-evident audit trail that can be verified
end-to-end without trusting the DB.

## Decision

Each `trading.trades` row carries `prev_hash` and `hash` columns:

- `prev_hash` = the previous trade's `hash` for the same `broker_id`
  (or `'0' * 64` for the first trade — `GENESIS_HASH`).
- `hash` = `SHA-256(prev_hash || canonical_json(record))`.

The canonical JSON is the trade's fields with sorted keys and no whitespace,
using `Money.toString()` for monetary values (so `"10"` and `"10.00"` hash
identically). Computed in application code inside the same DB transaction
as the insert; the transaction uses `SERIALIZABLE` isolation so concurrent
inserts for the same broker can't race the chain.

Verification:

- `apps/workers/src/processors/chain-verifier.ts` — runs nightly per broker,
  alerts on mismatch.
- `infra/scripts/verify-chain.ts` — standalone CLI, exits non-zero on break.
- E2E test in `apps/api/test/e2e/trades-chain.e2e-spec.ts` proves the
  positive case and the role-based append-only enforcement.

## Alternatives considered

- **HMAC instead of plain SHA-256** — adds a key the attacker would need.
  Deferred — most attack surface is "insider with DB write access", and
  storing the chain key in the DB defeats it. Could move to
  HSM-backed HMAC later.
- **External signed log (e.g., AWS QLDB)** — adds another infra dependency
  for a property we can model in 50 lines of TypeScript.
- **Merkle tree** — overkill for the scale; single-chain is O(N) to verify
  and O(1) to extend, which fits our nightly job comfortably.

## Consequences

- All trade-recording code paths must use `TradesService.recordTrade` (or
  `OrderProcessor.recordFill` in workers) — never raw inserts. The seed
  script `infra/scripts/seed.ts` and the e2e test reproduce the chaining
  logic explicitly to keep that contract honest.
- Corrections to a trade are _new_ trade rows referencing the original; the
  chain stays unbroken.
- Chain verification cost: ~200 µs per trade in benchmarks (SHA-256 +
  canonical JSON). 10M trades verifies in ~30 minutes — acceptable for
  nightly.
