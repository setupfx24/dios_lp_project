# ADR-0006: Admin app deployed separately from the broker dashboard

- Status: accepted
- Date: 2026-05-15

## Context

The broker dashboard (`apps/web`) is a public-facing app subject to scale,
heavy caching, and CDN deployment. The LP operator panel (`apps/admin`) is
internal-only — it controls broker onboarding, charge configuration, manual
interventions, and 4-eyes-approved actions. Mixing the two in one deployment:

- forces the public surface to ship admin code (bigger bundle, larger attack surface);
- ties their release cadences together (admin should ship behind a more cautious gate);
- collapses their security posture (CSP, IP allowlist, session length, 2FA all want to differ).

## Decision

**Two separate Next.js apps**, both served by the same backend NestJS app:

- `apps/web` → public CDN/edge. 1-hour idle. JWT cookie `lp_access`.
- `apps/admin` → private subnet behind VPN/WAF. 15-min idle, 2FA-mandatory,
  reauth-on-sensitive-action. JWT cookie `lp_admin_access` signed with a
  separate secret (`ADMIN_JWT_SECRET`). Visual differentiation (red/orange
  accent) prevents an operator from mistaking the surface.

**Backend route prefixes**:

- `/api/v1/broker/*` — broker dashboard + HMAC broker→LP API
- `/api/v1/admin/*` — admin only

**Single binary, route-gated by env**: `ROUTES_ENABLED=broker|admin|all`.
Topology is a deploy-time choice — no code changes to split into two
deployments. Same Drizzle schema, same `lp_app` DB role; admin restrictions
are application-layer (guards + permissions) plus DB-layer (REVOKE on
immutable tables, CHECK constraints on `pending_actions`).

## Alternatives considered

- **Single Next.js app, route-based separation**: tempting but the bundle
  ships admin code to the public surface. Hard to enforce different CSP
  per route. Rejected.
- **Separate backend repos**: maximum isolation but doubles all DB schema
  ownership. Premature for our scale. The route-prefix + ROUTES*ENABLED
  flag approach lets us split the \_deployment* without splitting the
  _codebase_ — best of both.
- **Use the same JWT secret with a role claim**: trivially upgrades any
  broker token compromise into admin access. Rejected on principle.

## Consequences

- Two Dockerfiles, two image tags, two deploy pipelines (handled in
  `.github/workflows/docker.yml` matrix).
- Slightly more code (two SDK clients: `LpClient` and `AdminClient`).
- Cookie scoping is path-based (`/api/v1/admin` vs `/`) so a single
  browser session can hold both cookies if you happen to be both a broker
  user and an admin — but the JWTs are signed separately and don't
  cross-validate.
- ROUTES_ENABLED gate is enforced at the Nest module level via
  `AppModule.register()` (dynamic module returning a different `imports`
  list). A misconfigured deployment fails to mount the unwanted controller
  group rather than serving it accidentally.
