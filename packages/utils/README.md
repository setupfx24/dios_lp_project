# @lp/utils

Pure runtime helpers shared by every app.

| Module       | What                                                 |
| ------------ | ---------------------------------------------------- |
| `Money`      | `decimal.js`-backed money type; Indian-style format. |
| `hash-chain` | Canonical JSON + SHA-256 trade chain.                |
| `hmac`       | Sign/verify broker→LP requests; 30s replay window.   |
| `id`         | ULID generation, validation, time decode.            |
| `time`       | UTC ISO helpers; UI handles localization.            |

## Why a `Money` class?

Drizzle returns `NUMERIC(20, 4)` columns as strings. Coercing to `Number`
loses precision (`0.1 + 0.2 !== 0.3`). `Money` preserves arbitrary precision,
serializes as a canonical decimal string, and never silently downcasts.

## Hash chain

Each trade's hash is `SHA-256(prevHash || canonical(trade))`. Canonical
serialization sorts object keys, drops `undefined`, and uses each value's
`toJSON` (so `Money` becomes its decimal string). The first trade in a
broker's chain uses `GENESIS_HASH = '0' * 64` as `prevHash`.

The nightly `chain-verifier.processor` and `infra/scripts/verify-chain.ts`
walk the chain end-to-end and exit non-zero on mismatch.
