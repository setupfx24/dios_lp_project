# ADR-0005: Drizzle ORM over Prisma

- Status: accepted
- Date: 2026-05-15

## Context

We need an ORM that:

- Lets us drop into raw SQL when we need to (nightly chain verifier walks
  rows in chunks; settlement uses CTEs).
- Generates plain SQL migrations that show up in PRs as text diffs.
- Plays well with serverless / edge runtimes (Drizzle has no runtime engine
  binary).
- Uses TypeScript inference, not codegen.

## Decision

**Drizzle ORM 0.34** with the `node-postgres` driver. Migrations via
`drizzle-kit generate` (plain `.sql` files committed to the repo).

## Alternatives considered

- **Prisma**: best-in-class DX for simple cases, but the Rust-binary engine
  is opaque, migrations are stored in a relational table not in version
  control as SQL by default, and raw SQL escapes are awkward. Cost-of-change
  for our append-only / hash-chain logic was higher.
- **Kysely**: closest to "just a query builder"; rejected because Drizzle's
  schema-as-code is more shareable across api / workers / drizzle-kit.
- **Plain `pg` + handwritten SQL**: what we actually fall back to in the
  workers app and the seed script. Fine for read-heavy or batch code; too
  verbose for the modular CRUD in the api.

## Consequences

- Drizzle-kit's CJS schema loader does **not** resolve NodeNext `.js`
  extensions in transitive imports. We work around this by pointing
  `drizzle.config.ts` at a glob of schema files instead of the barrel
  index. See `apps/api/src/database/drizzle.config.ts`.
- We commit hand-written SQL alongside generated SQL (the security
  migration in `migrations/security/0001_security.sql`). The migrate
  runner applies generated migrations first, then `security/*.sql` in
  name order.
- Workers do not import Drizzle schema (would create a cross-app dep);
  they use raw `pg.Pool` queries. If this duplication grows, we'll
  extract a `packages/db-schema` package.
