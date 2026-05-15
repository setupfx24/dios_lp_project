# LP Platform

> Production-grade Liquidity Provider platform. Receives signed orders from broker platforms, validates them, runs pre-trade risk checks, executes through a matching engine, applies itemized charges (brokerage, STT, GST, exchange fee, stamp duty), records immutable hash-chained trade entries, and pushes live updates to broker dashboards.

## Architecture (high level)

```
                       +-------------------+
                       |   Broker (HMAC)   |
                       +---------+---------+
                                 | POST /orders
                                 v
+--------+    HMAC guard    +----+----+    BullMQ    +-----------+
|  api   +----------------->+ orders  +------------->+  workers  |
| (Nest) |                  |  queue  |              |  (Nest)   |
+---+----+                  +---------+              +-----+-----+
    |                                                       |
    |  Postgres (trading, ledger, audit, market, auth)      |
    |  - lp_app:  SELECT/INSERT only on append-only tables  |
    |  - BEFORE UPDATE/DELETE triggers raise exceptions     |
    |  - Trades hash-chained (prev_hash -> hash)            |
    |                                                       |
    v                                                       v
+---+-----------------------------------------------------------+
|                       PostgreSQL 16 + TimescaleDB             |
+----------+----------------------------------------------------+
           |
           | socket.io (rooms per brokerId)
           v
   +-------+-------+         +-------+
   |  web (Next)   |<------->| admin |
   +---------------+         +-------+
```

## Prerequisites

- **Node** 20 LTS (`nvm use`)
- **pnpm** 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker** 24+ with Compose v2
- **Git** 2.40+

## Quickstart

```sh
pnpm install
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
pnpm db:migrate
pnpm tsx infra/scripts/seed.ts
pnpm dev
```

- API: http://localhost:3000
- Web: http://localhost:3001
- Admin: http://localhost:3002
- Swagger:http://localhost:3000/docs
- pgAdmin:http://localhost:5050
- Redis Commander: http://localhost:8081

## Common commands

| Command                                  | Purpose                                        |
| ---------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                               | Run all apps in watch mode (turbo)             |
| `pnpm build`                             | Build all apps + packages                      |
| `pnpm lint`                              | Lint everything                                |
| `pnpm typecheck`                         | Type-check everything                          |
| `pnpm test`                              | Run unit + integration tests (testcontainers)  |
| `pnpm db:generate`                       | Generate Drizzle migration from schema changes |
| `pnpm db:migrate`                        | Apply migrations to the configured database    |
| `pnpm tsx infra/scripts/verify-chain.ts` | Verify trade hash chain integrity              |

## Folder map

```
apps/
  api/         NestJS + Fastify REST + WebSocket
  web/         Next.js broker dashboard
  admin/       Next.js LP operator console
  workers/     BullMQ worker processes (separate from api)
packages/
  types/       Pure TS types
  validators/  Zod schemas (money fields = string, never number)
  constants/   Error codes, order types, charge rates
  utils/       Money class, hash chain, HMAC, ULID
  sdk/         Typed API client used by web/admin
  config/      Shared eslint/tsconfig/prettier
infra/
  docker/      docker-compose, postgres init scripts
  k8s/         (placeholder — future)
  scripts/     seed, verify-chain, backup
docs/
  adr/         Architecture decision records
  runbooks/    Incident playbooks
  api/         Generated OpenAPI artifact
```

## Documentation

- [Architecture](docs/architecture.md)
- [Database (schema, roles, immutability)](docs/database.md)
- [Security model](docs/security.md)
- [ADRs](docs/adr/)
- [Runbooks](docs/runbooks/)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
