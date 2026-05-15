# Deployment topology

## Single-binary (default)

```
                ┌──────────────┐
public ─HTTPS──>│  api (all)   │<──── workers
                │              │
private VPN ───>│              │
                └──────┬───────┘
                       │
                Postgres + Redis
```

`ROUTES_ENABLED=all` (the default). One `apps/api` instance serves both
broker (`/api/v1/broker/*`) and admin (`/api/v1/admin/*`). Used in dev,
staging, and small production deployments.

## Split (recommended at scale)

```
              public                 private
              ───────                ───────

broker  ─────>┌─────────────┐
              │ api-broker  │ ROUTES_ENABLED=broker
              │  (CDN edge) │
              └──────┬──────┘
                     │
                     ├──── Postgres + Redis ────┐
                     │                          │
              ┌──────┴──────┐                   │
admin VPN ───>│ api-admin   │ ROUTES_ENABLED=admin
              │  (private)  │                   │
              └─────────────┘                   │
                                                │
                              workers ──────────┘
```

Same image, two deployments, gated by env. Network rules:

| Component    | Public ingress        | Egress to                    |
| ------------ | --------------------- | ---------------------------- |
| `web`        | yes (CDN/edge)        | api-broker                   |
| `admin`      | **no — VPN/WAF only** | api-admin                    |
| `api-broker` | yes (HMAC + JWT)      | postgres, redis              |
| `api-admin`  | **no — VPN-only**     | postgres, redis              |
| `workers`    | none                  | postgres, redis, optional S3 |
| `postgres`   | private subnet only   | —                            |
| `redis`      | private subnet only   | —                            |

## Deployment cadence

- `web` + `api-broker`: standard CI/CD; rapid iteration acceptable.
- `admin` + `api-admin`: gated by manual approval. Every release goes
  through a staging cycle with security review for changes touching
  guards, decorators, or `pending_actions` flows.
- `workers`: paired with `api-admin` releases when admin schemas change;
  otherwise tracks `api-broker`.

## Environment matrix

| Env key                       | broker | admin | workers |
| ----------------------------- | :----: | :---: | :-----: |
| `DATABASE_URL`                |   ✅   |  ✅   |   ✅    |
| `REDIS_URL`                   |   ✅   |  ✅   |   ✅    |
| `JWT_SECRET`                  |   ✅   | ⚠️\*  |    —    |
| `ADMIN_JWT_SECRET`            |   —    |  ✅   |    —    |
| `TOTP_ENCRYPTION_KEY`         |   —    |  ✅   |    —    |
| `ADMIN_4EYES_THRESHOLD_PAISE` |   —    |  ✅   |   ✅    |
| `ADMIN_IDLE_TIMEOUT_SECONDS`  |   —    |  ✅   |    —    |
| `ROUTES_ENABLED`              | broker | admin |  (n/a)  |
| `CORS_ORIGINS`                |   ✅   |  ✅   |    —    |

⚠️* Admin instance still needs `JWT_SECRET` defined (Zod schema rejects
missing) but should use a *different\* value from broker and never share
it across deployments.

## Failure modes

- **api-broker down**: brokers can't place orders or view dashboards.
  workers continue draining the queue from prior orders.
- **api-admin down**: brokers unaffected. Operators cannot intervene or
  approve pending actions.
- **workers down**: orders queue but don't fill. P2 — alert on queue depth.
- **postgres down**: P0. All writes block. Failover to read replica is
  manual; LP cannot accept new orders during DB outage.

See [runbooks](runbooks/) for incident playbooks.
