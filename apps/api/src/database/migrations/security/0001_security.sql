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
-- Passwords are sourced from Postgres custom GUCs `lp.app_pw` and `lp.ro_pw`.
-- docker-compose passes these via `-c lp.app_pw=$LP_APP_PW`. The migration
-- refuses to run if either GUC is missing, too short, or still set to the
-- documented .env.example placeholder — running this against prod with the
-- placeholder would create roles with a publicly-known password (B3).
-- On re-run the password is rotated via ALTER ROLE.
DO $$
DECLARE
  app_pw text := current_setting('lp.app_pw', true);
  ro_pw  text := current_setting('lp.ro_pw', true);
BEGIN
  IF app_pw IS NULL OR app_pw = '' THEN
    RAISE EXCEPTION 'lp.app_pw GUC is not set. Pass via Postgres -c lp.app_pw=<random>; in docker-compose use the LP_APP_PW env var.';
  END IF;
  IF ro_pw IS NULL OR ro_pw = '' THEN
    RAISE EXCEPTION 'lp.ro_pw GUC is not set. Pass via Postgres -c lp.ro_pw=<random>; in docker-compose use the LP_RO_PW env var.';
  END IF;
  IF length(app_pw) < 12 THEN
    RAISE EXCEPTION 'lp.app_pw must be at least 12 characters (got %)', length(app_pw);
  END IF;
  IF length(ro_pw) < 12 THEN
    RAISE EXCEPTION 'lp.ro_pw must be at least 12 characters (got %)', length(ro_pw);
  END IF;
  IF app_pw = 'changeme_in_compose_env' OR ro_pw = 'changeme_in_compose_env' THEN
    RAISE EXCEPTION 'lp.app_pw or lp.ro_pw is still the .env.example placeholder. Generate a fresh random value before running migrations against any non-throwaway database.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lp_app') THEN
    EXECUTE format('CREATE ROLE lp_app LOGIN PASSWORD %L', app_pw);
  ELSE
    EXECUTE format('ALTER ROLE lp_app WITH PASSWORD %L', app_pw);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lp_readonly') THEN
    EXECUTE format('CREATE ROLE lp_readonly LOGIN PASSWORD %L', ro_pw);
  ELSE
    EXECUTE format('ALTER ROLE lp_readonly WITH PASSWORD %L', ro_pw);
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
