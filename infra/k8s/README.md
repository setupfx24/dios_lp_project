# Kubernetes (placeholder)

This monorepo currently ships Docker Compose for local dev and CI. Production
deployments will move to Kubernetes; this folder is reserved for that future
manifests / Helm chart.

## Migration sketch

- **Postgres**: managed (RDS / Cloud SQL) — never run a stateful, snowflake DB
  in your own k8s cluster unless you already operate StatefulSets at scale.
- **Redis**: managed (ElastiCache / Memorystore) for the same reasons.
- **api**, **workers**, **web**, **admin**: Deployments with `readinessProbe`
  pointing at `/health`. Workers run with `concurrency: 1` per-pod and scale
  horizontally via the orders-queue depth metric.
- **Ingress**: TLS termination at the load balancer; web exposes `/`, api
  exposes `/v1/*` and `/ws`.
- **Secrets**: env injected via External Secrets Operator (Vault / AWS SM).
- **Observability**: Prometheus scrape on `/metrics` (to be added) + Pino logs
  to stdout, captured by the platform's log collector.

Until then, see `infra/docker/docker-compose.yml`.
