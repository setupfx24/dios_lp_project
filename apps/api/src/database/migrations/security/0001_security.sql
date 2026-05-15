-- =============================================================================
-- 0001_security.sql
-- Hand-written, idempotent. Applied AFTER drizzle-kit's generated migrations.
--
-- Enforces:
--   1. Three-role model (lp_owner / lp_app / lp_readonly)
--   2. Append-only on trading.trades, ledger.ledger_entries, audit.audit_logs
--      via REVOKE + BEFORE UPDATE/DELETE trigger (defense in depth)
--   3. TimescaleDB extension + market.ticks hypertable
-- =============================================================================

-- ---------- Roles ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lp_app') THEN
    CREATE ROLE lp_app LOGIN PASSWORD 'changeme_in_compose_env';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lp_readonly') THEN
    CREATE ROLE lp_readonly LOGIN PASSWORD 'changeme_in_compose_env';
  END IF;
END $$;

-- ---------- Schema usage ----------
GRANT USAGE ON SCHEMA trading, ledger, audit, market, auth, admin TO lp_app, lp_readonly;

-- ---------- Default privileges so future tables inherit ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trading, ledger, audit, market, auth, admin TO lp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA trading, ledger, audit, market, auth, admin TO lp_app;

GRANT SELECT ON ALL TABLES IN SCHEMA trading, ledger, audit, market, auth, admin TO lp_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA trading, ledger, audit, market, auth, admin
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA trading, ledger, audit, market, auth, admin
  GRANT USAGE, SELECT ON SEQUENCES TO lp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA trading, ledger, audit, market, auth, admin
  GRANT SELECT ON TABLES TO lp_readonly;

-- ---------- Append-only revoke ----------
REVOKE UPDATE, DELETE ON trading.trades       FROM lp_app;
REVOKE UPDATE, DELETE ON ledger.ledger_entries FROM lp_app;
REVOKE UPDATE, DELETE ON audit.audit_logs     FROM lp_app;
-- explicit revoke also from PUBLIC and other future roles
REVOKE UPDATE, DELETE ON trading.trades       FROM PUBLIC;
REVOKE UPDATE, DELETE ON ledger.ledger_entries FROM PUBLIC;
REVOKE UPDATE, DELETE ON audit.audit_logs     FROM PUBLIC;

-- ---------- Append-only trigger (defense in depth) ----------
CREATE OR REPLACE FUNCTION trading.fn_block_mutations() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Append-only table %, mutation forbidden', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trades_block_mutations ON trading.trades;
CREATE TRIGGER trg_trades_block_mutations
  BEFORE UPDATE OR DELETE ON trading.trades
  FOR EACH ROW EXECUTE FUNCTION trading.fn_block_mutations();

DROP TRIGGER IF EXISTS trg_ledger_block_mutations ON ledger.ledger_entries;
CREATE TRIGGER trg_ledger_block_mutations
  BEFORE UPDATE OR DELETE ON ledger.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION trading.fn_block_mutations();

DROP TRIGGER IF EXISTS trg_audit_block_mutations ON audit.audit_logs;
CREATE TRIGGER trg_audit_block_mutations
  BEFORE UPDATE OR DELETE ON audit.audit_logs
  FOR EACH ROW EXECUTE FUNCTION trading.fn_block_mutations();

-- ---------- TimescaleDB ----------
CREATE EXTENSION IF NOT EXISTS timescaledb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'market' AND hypertable_name = 'ticks'
  ) THEN
    PERFORM create_hypertable(
      'market.ticks',
      'timestamp',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  END IF;
END $$;

-- Compress chunks older than 7 days to save space.
ALTER TABLE market.ticks SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_compression' AND hypertable_name = 'ticks'
  ) THEN
    PERFORM add_compression_policy('market.ticks', INTERVAL '7 days');
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    -- TimescaleDB community edition vs apache edition differ; ignore if missing.
    NULL;
END $$;

-- ---------- 4-eyes: refuse self-approval at the DB layer (defense in depth) ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'admin' AND table_name = 'pending_actions') THEN
    BEGIN
      ALTER TABLE admin.pending_actions
        ADD CONSTRAINT chk_pending_actions_no_self_approval
        CHECK (approved_by IS NULL OR approved_by <> requested_by);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE admin.pending_actions
        ADD CONSTRAINT chk_pending_actions_no_self_rejection
        CHECK (rejected_by IS NULL OR rejected_by <> requested_by);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
