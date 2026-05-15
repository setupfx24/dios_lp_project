-- Initial role setup. Runs once when the postgres data dir is first
-- bootstrapped (mounted into /docker-entrypoint-initdb.d). The 999 security
-- migration in apps/api re-asserts grants idempotently — this just creates
-- the roles with their environment-supplied passwords.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lp_owner') THEN
    EXECUTE format('CREATE ROLE lp_owner LOGIN PASSWORD %L', current_setting('lp.owner_pw', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lp_app') THEN
    EXECUTE format('CREATE ROLE lp_app   LOGIN PASSWORD %L', current_setting('lp.app_pw',   true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lp_readonly') THEN
    EXECUTE format('CREATE ROLE lp_readonly LOGIN PASSWORD %L', current_setting('lp.ro_pw', true));
  END IF;
END $$;

-- Make lp_owner the owner of the application database so subsequent
-- migrations (run as lp_owner) can do DDL.
ALTER DATABASE lp OWNER TO lp_owner;

-- Allow lp_app and lp_readonly to connect.
GRANT CONNECT ON DATABASE lp TO lp_app, lp_readonly;
