# Database

## Schemas (Postgres namespaces)

```mermaid
erDiagram
    BROKERS ||--o{ API_KEYS : "issues"
    BROKERS ||--o{ ORDERS : "places"
    BROKERS ||--o{ TRADES : "settles"
    BROKERS ||--o{ WALLETS : "owns"
    USERS }o--|| BROKERS : "scoped to"
    ORDERS ||--o{ TRADES : "fills"
    TRADES ||--o{ CHARGES : "incurs"
    WALLETS ||--o{ LEDGER_ENTRIES : "posts"

    BROKERS { text broker_id PK
              text display_name
              text status }
    API_KEYS { text api_key_id PK
               text broker_id FK
               text key_prefix
               text secret_hash }
    USERS { text user_id PK
            text email
            text role
            text broker_id FK }
    ORDERS { text order_id PK
             text broker_id FK
             text symbol
             numeric quantity
             numeric price }
    TRADES { text trade_id PK
             text order_id FK
             text broker_id FK
             numeric quantity
             numeric price
             text prev_hash
             text hash }
    CHARGES { text trade_id FK
              text type
              numeric amount }
    WALLETS { text wallet_id PK
              text broker_id FK
              text currency }
    LEDGER_ENTRIES { text entry_id PK
                     text wallet_id FK
                     text direction
                     numeric amount
                     text reference_type
                     text reference_id }
```

| Schema    | Tables                                            | Append-only? |
| --------- | ------------------------------------------------- | ------------ |
| `auth`    | `users`, `sessions`, `brokers`, `api_keys`        | no           |
| `trading` | `orders`, **`trades`**, `charges`                 | trades only  |
| `ledger`  | `wallets`, **`ledger_entries`**                   | entries only |
| `audit`   | **`audit_logs`**                                  | yes          |
| `market`  | `instruments`, `ticks` (TimescaleDB hypertable)   | no           |
| `public`  | empty (intentionally — anti-pattern to dump here) | n/a          |

## Roles

| Role          | Used for               | Privileges                                                                                                                                                       |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lp_owner`    | migrations only (DDL)  | OWNER of `lp` database                                                                                                                                           |
| `lp_app`      | runtime (api, workers) | `SELECT`/`INSERT` on all tables; **no `UPDATE`/`DELETE`** on the three append-only tables; `UPDATE`/`DELETE` allowed on mutable tables (`orders`, `users`, etc.) |
| `lp_readonly` | analytics / BI         | `SELECT` everywhere                                                                                                                                              |

The append-only restriction is enforced **twice**: `REVOKE UPDATE, DELETE`
plus a `BEFORE UPDATE OR DELETE` trigger that raises `'Append-only table'`.

## Migrations

- **Generated**: `pnpm --filter @lp/api db:generate` (drizzle-kit). Reviewable
  SQL in `apps/api/src/database/migrations/`.
- **Hand-written security**: `apps/api/src/database/migrations/security/0001_security.sql`
  applied automatically after generated migrations by `db:migrate`.
- **Never** edit a committed migration. Always write a new one.
- **Never** add `UPDATE` / `DELETE` capability against append-only tables.

## Backup procedure

```sh
DATABASE_URL=postgres://lp_owner:...@host/lp pnpm tsx infra/scripts/backup.sh
```

Production should rely on managed Postgres point-in-time recovery; the script
above is for ad-hoc dumps during incidents.

## Restoring after a chain break

1. Run `pnpm tsx infra/scripts/verify-chain.ts <brokerId>` — confirm the break.
2. Take a snapshot of current state.
3. Identify the broken segment. _Do not delete or update._ Insert reversal
   trades and a fresh chain segment that references the last valid trade.
4. See [runbook](runbooks/incident-hash-chain-broken.md).
