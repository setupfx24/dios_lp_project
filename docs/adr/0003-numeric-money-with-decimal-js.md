# ADR-0003: Money as `NUMERIC(20, 4)` + `Money` (decimal.js) in code

- Status: accepted
- Date: 2026-05-15

## Context

JavaScript's `Number` is IEEE-754 binary64. `0.1 + 0.2 !== 0.3`. Drizzle
returns `NUMERIC` as a string by default precisely because of this. We need
to do arithmetic on monetary values reliably.

## Decision

- **DB**: every monetary column is `NUMERIC(20, 4) NOT NULL`. Never `FLOAT`,
  never untyped `DECIMAL`.
- **Code**: a `Money` class wrapping `decimal.js` (40-digit precision,
  banker's rounding). The constructor refuses fractional JS Numbers
  (`new Money(1.1)` throws) and rejects malformed strings.
- **Wire format**: serialized as a canonical decimal string via `Money.toJSON()`.
  API responses never put money in a JSON number.
- **Display**: `Money.format()` produces Indian-grouped INR (`₹1,23,456.78`)
  by default; UI helper `formatMoney()` is a one-liner over it.
- **Hashing**: `Money.toString()` returns the canonical form used by the
  trade hash chain — eliminates "10 vs 10.0 vs 10.00" ambiguity.

## Alternatives considered

- **`bignumber.js`** — equivalent. Picked decimal.js for its better TS
  type story.
- **Native `BigInt`** — works for whole-money in paise / cents, but loses
  fractional precision for fee calculations (e.g., `* 0.0000297`).
- **Plain string everywhere** — would force every consumer to reach for a
  decimal library individually. The class centralizes safety.

## Consequences

- Validators (`@lp/validators`) enforce `decimalString` shape at API edges.
- The `Money` class adds ~40 KB to client bundles. Acceptable for the
  dashboards (no public site).
- Tests (`packages/utils/src/money.test.ts`) cover precision (0.1+0.2),
  Indian formatting, and JSON serialization.
