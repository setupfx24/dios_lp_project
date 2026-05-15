# ADR-0002: PostgreSQL (with TimescaleDB) over a document store

- Status: accepted
- Date: 2026-05-15

## Context

We need:

- Multi-table ACID transactions (record trade + insert charges + post ledger
  pair atomically).
- Strict referential integrity (orders → trades → charges; wallets → entries).
- Append-only enforcement that survives misconfigured application code.
- Time-series storage for tick data, with retention/compression.
- A storage engine fintech regulators recognize.

## Decision

PostgreSQL 16 with the TimescaleDB extension (`market.ticks` is a hypertable).
Schemas (`trading`, `ledger`, `audit`, `market`, `auth`) provide logical
separation; the `public` schema is intentionally empty.

## Alternatives considered

- **MongoDB** — multi-document transactions exist but with sharding caveats;
  no strict FK enforcement; append-only would be application-only (no
  equivalent of `REVOKE UPDATE`).
- **DynamoDB** — strong scale story but the data model would force us to
  denormalize trades + charges + ledger into one item, breaking auditability.
- **MySQL** — viable, but fewer first-class extensions for our use cases
  (no equivalent of TimescaleDB; weaker `EXCLUDE` constraints).
- **CockroachDB** — Postgres-wire compatible; deferred until we need
  multi-region. Adds cost and operational complexity now for no immediate gain.

## Consequences

- Worker hosts and the api hit the same DB; we must size pool limits
  carefully (`DATABASE_POOL_MAX` per process).
- Schema-per-domain enables targeted role grants (e.g., the analytics role
  could be granted only on `market` and `trading`).
- Application code must stay role-aware; integration tests use the runtime
  `lp_app` role specifically to catch grant misconfigurations.
