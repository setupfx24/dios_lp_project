# Contributing

## Branch naming

- `feat/<scope>-<short-desc>` — new feature
- `fix/<scope>-<short-desc>` — bug fix
- `chore/<scope>-<short-desc>` — non-functional (tooling, deps)
- `docs/<scope>-<short-desc>` — documentation only
- `refactor/<scope>-<short-desc>` — internal restructuring, no behavior change

`<scope>` is an app/package name: `api`, `web`, `workers`, `validators`, etc.

## Commit messages

Conventional commits, enforced by commitlint:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`.

Subject in lower-case or sentence-case, no trailing period, ≤100 chars.

Example: `feat(trades): hash-chain previous trade hash on insert`

## PR checklist

- [ ] Branch follows naming convention
- [ ] All commits follow conventional commit format
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (zero warnings)
- [ ] `pnpm test` passes (including testcontainers-based integration tests)
- [ ] New behavior covered by tests
- [ ] Public API changes reflected in `@lp/sdk` and OpenAPI doc
- [ ] Migration files added if schema changed (never edit a committed migration)
- [ ] **No `UPDATE` / `DELETE` against `trading.trades`, `ledger.ledger_entries`, `audit.audit_logs` introduced**
- [ ] Money handled via `Money` class (no JS `Number` for currency)
- [ ] ADR added for non-trivial architecture decisions (`docs/adr/`)
- [ ] Docs updated if user-facing or operator-facing behavior changed

## Local workflow

```sh
pnpm install                  # install deps
pnpm dev                      # all apps in watch mode
pnpm test                     # unit + integration (Docker required)
pnpm lint && pnpm typecheck   # before push
```

## Adding a new package

1. `mkdir packages/<name>/src`
2. `cd packages/<name>` and add `package.json` (name `@lp/<name>`), `tsconfig.json` extending `@lp/tsconfig/base.json`, `eslint.config.js` re-exporting `@lp/eslint-config`
3. Document the package's purpose in its `README.md`

## Adding a new module to apps/api

Each module follows: `controller / service / repository / module / schema / dto / spec`. See `apps/api/src/modules/trades/` for the canonical example.

## Database changes

1. Edit Drizzle schema in `apps/api/src/modules/<module>/schema/`
2. Run `pnpm db:generate` — produces a new SQL migration
3. Review the SQL carefully (this is the file that lands in production)
4. Commit both schema and migration in the same PR

**Never** edit a committed migration. Write a new one.

**Never** add `UPDATE` or `DELETE` capability against append-only tables. If you genuinely need to express a correction, insert a reversal row.
