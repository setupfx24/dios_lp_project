# ADR-0001: Monorepo tooling — pnpm workspaces + Turborepo

- Status: accepted
- Date: 2026-05-15

## Context

We need to share types, validators, money helpers, and an SDK across an
NestJS API, two Next.js apps, and a worker process. Per-repo duplication
caused drift in early prototypes (money formatter went out of sync between
api and web).

## Decision

- **Workspace**: pnpm 9+ workspaces. Cheap symlinks; deterministic
  `pnpm-lock.yaml`.
- **Build orchestrator**: Turborepo for `build`/`lint`/`test`/`typecheck`
  pipelines with content-hashed caching.

## Alternatives considered

- **npm/yarn workspaces** — both work, but pnpm's strict dependency hoisting
  catches accidental cross-package imports earlier.
- **Nx** — more capable scheduler but heavier configuration footprint; we
  don't need its plugin ecosystem yet.
- **Bazel** — appropriate at FAANG scale; massive overhead for a 4-app repo.
- **Single repo, no workspaces** — re-introduces the drift problem.

## Consequences

- ESLint flat config + tsconfig project references must align to pnpm's
  symlinked layout (already done in `packages/config/`).
- `pnpm install` strictness occasionally needs `peerDependencyRules` for
  ecosystem packages with stale peers (eslint v9 transition).

## Follow-ups

- Add Turborepo Remote Cache once we have a CI account.
