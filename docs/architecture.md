# Architecture

## Order flow

```
broker (HMAC-signed)
   │  POST /orders
   ▼
┌──────────────────────────┐
│ apps/api (NestJS+Fastify)│
│   HmacGuard              │  ── reject? ── audit
│   ZodValidationPipe      │
│   OrdersController       │
│     INSERT trading.orders│
│     enqueue BullMQ       │  ───────────────────────────────────────┐
└──────────────────────────┘                                          │
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │ apps/workers                 │
                                                       │   risk.check()               │
                                                       │   matching.match()           │
                                                       │   tx { trades.insert(hash)   │
                                                       │        charges.insertMany()  │
                                                       │        ledger.postPair() }   │
                                                       │   redis.publish(lp.events)   │
                                                       └──────────────────────────────┘
                                                                      │
                                                                      │ Redis pub/sub
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │ apps/api EventsGateway       │
                                                       │   socket.io → broker:<id>    │
                                                       └──────────────────────────────┘
                                                                      │
                                                                      ▼
                                                                  apps/web dashboard
                                                                  (TanStack Query cache update)
```

## Immutability strategy

Three layers, applied to `trading.trades`, `ledger.ledger_entries`, `audit.audit_logs`:

1. **Repository API surface.** No `update` / `delete` methods.
2. **Postgres role grants.** `lp_app` lacks `UPDATE`/`DELETE` on these tables.
3. **`BEFORE UPDATE OR DELETE` trigger.** Raises an exception even if grants are
   later misconfigured.

Plus the **hash chain** on trades: each row carries `prev_hash` (= previous
trade's `hash`) and `hash` (= SHA-256 of canonical JSON || prev_hash). The
nightly `chain-verifier` and `infra/scripts/verify-chain.ts` walk the chain
end-to-end and fail loudly on mismatch.

Corrections never `UPDATE`; they insert reversal entries.

## Security model

- **Broker → LP**: HMAC-SHA256 over `timestamp\nrequestLine\nbody`,
  30-second replay window, timing-safe comparison. API keys stored as Argon2
  hashes.
- **Dashboard / admin user → LP**: JWT in httpOnly cookie, 15-minute access,
  separate refresh token. Argon2id password hashing.
- **LP → Postgres**: connection-pooled `lp_app` role with no DDL and no
  mutate/delete on append-only tables.
- **Audit**: every guard rejection, login, admin action, order placement
  lands in `audit.audit_logs` (also append-only).

## Money

`NUMERIC(20, 4)` in the DB. `Money` (decimal.js) class in code. Wire format:
canonical decimal string. Never JS `Number`. See
[ADR-0003](adr/0003-numeric-money-with-decimal-js.md).

## Scaling roadmap

| Stage          | Move                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| 1 — local dev  | docker-compose, single Postgres, single Redis, all apps in one host      |
| 2 — staging    | Managed Postgres + Redis, container platform per app                     |
| 3 — production | Read replicas for analytics; partition `trading.trades` by `executed_at` |
| 4 — scale-out  | Sharded BullMQ queues per broker tier; PgBouncer in front of Postgres    |
