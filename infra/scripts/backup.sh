#!/usr/bin/env bash
# Trivial pg_dump wrapper. Production should use a managed Postgres backup
# system (RDS automated backups, point-in-time recovery, etc.). This script
# is for ad-hoc dumps during incidents.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set}"
OUT_DIR="${OUT_DIR:-./backups}"
TS=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/lp_${TS}.sql.gz"

echo "[backup] -> $OUT"
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$OUT"
echo "[backup] done ($(du -h "$OUT" | cut -f1))"
