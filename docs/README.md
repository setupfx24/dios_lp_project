# Documentation index

| Topic                         | Where                                                 |
| ----------------------------- | ----------------------------------------------------- |
| Architecture overview         | [architecture.md](architecture.md)                    |
| Database schema, roles, ops   | [database.md](database.md)                            |
| Security model & threat model | [security.md](security.md)                            |
| Deployment topology           | [deployment.md](deployment.md)                        |
| Admin operations              | [admin-operations.md](admin-operations.md)            |
| Architecture decisions (ADRs) | [adr/](adr/)                                          |
| Incident runbooks             | [runbooks/](runbooks/)                                |
| Generated OpenAPI             | [api/openapi.json](api/openapi.json) (build artifact) |

## Per-app / per-package READMEs

- [apps/api/src/modules/trades/README.md](../apps/api/src/modules/trades/README.md) — append-only enforcement
- [apps/api/src/modules/ledger/README.md](../apps/api/src/modules/ledger/README.md) — double-entry posting
- [apps/api/src/modules/audit/README.md](../apps/api/src/modules/audit/README.md) — audit log sources
- [packages/utils/README.md](../packages/utils/README.md) — Money, hash chain, HMAC
- [packages/validators/README.md](../packages/validators/README.md) — Zod schemas
- [packages/types/README.md](../packages/types/README.md) — pure types
- [packages/sdk/README.md](../packages/sdk/README.md) — typed API client
