-- =============================================================================
-- 0000_init.sql
-- Hand-written init migration (drizzle-kit's CJS schema loader cannot resolve
-- the NodeNext `.js` extensions in our schema files — see ADR-0005). This
-- file mirrors the Drizzle schema definitions exactly and is the source of
-- truth for the database structure until drizzle-kit gains support.
--
-- Idempotent: re-running on an existing database is a no-op via IF NOT EXISTS
-- on every CREATE.
-- =============================================================================

-- ---------- Schemas ----------
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS ledger;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS market;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS admin;

-- ---------- Enums ----------
-- pgEnum() puts enums in the default schema (public); drizzle-kit matches that.
DO $$ BEGIN
  CREATE TYPE user_type AS ENUM ('broker_user', 'admin_user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('broker_user', 'lp_admin', 'lp_operator', 'lp_readonly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM ('super_admin', 'ops', 'support', 'read_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE time_in_force AS ENUM ('DAY', 'IOC', 'FOK', 'GTC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'PENDING', 'ACCEPTED', 'PARTIALLY_FILLED', 'FILLED', 'REJECTED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE charge_type AS ENUM (
    'BROKERAGE', 'STT', 'EXCHANGE_FEE', 'GST', 'STAMP_DUTY', 'SEBI_FEE', 'TRANSACTION_FEE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_direction AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_reference_type AS ENUM (
    'TRADE', 'CHARGE', 'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pending_action_status AS ENUM (
    'pending', 'approved', 'rejected', 'executed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pending_action_type AS ENUM (
    'wallet.adjust', 'charges.rate.update', 'trade.reverse',
    'broker.suspend', 'broker.limits.update'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- auth.brokers ----------
CREATE TABLE IF NOT EXISTS auth.brokers (
  id              bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  broker_id       text    NOT NULL UNIQUE,
  display_name    text    NOT NULL,
  contact_email   text    NOT NULL,
  status          text    NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brokers_status ON auth.brokers (status);

-- ---------- auth.api_keys ----------
CREATE TABLE IF NOT EXISTS auth.api_keys (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_key_id    text   NOT NULL UNIQUE,
  broker_id     text   NOT NULL REFERENCES auth.brokers(broker_id) ON DELETE RESTRICT,
  label         text   NOT NULL,
  key_prefix    text   NOT NULL,
  secret_hash   text   NOT NULL,
  ip_allowlist  text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_api_keys_broker ON auth.api_keys (broker_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON auth.api_keys (key_prefix);

-- ---------- auth.users ----------
CREATE TABLE IF NOT EXISTS auth.users (
  id                   bigint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id              text      NOT NULL UNIQUE,
  email                text      NOT NULL UNIQUE,
  password_hash        text      NOT NULL,
  display_name         text      NOT NULL,
  role                 user_role NOT NULL,
  user_type            user_type NOT NULL DEFAULT 'broker_user',
  broker_id            text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  admin_role           admin_role,
  totp_secret_enc      text,
  totp_verified_at     timestamptz,
  recovery_codes_hash  text[],
  password_changed_at  timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  suspended_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_users_broker ON auth.users (broker_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON auth.users (role);
CREATE INDEX IF NOT EXISTS idx_users_type ON auth.users (user_type);

-- ---------- auth.sessions (broker dashboard) ----------
CREATE TABLE IF NOT EXISTS auth.sessions (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id          text   NOT NULL UNIQUE,
  user_id             text   NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
  refresh_token_hash  text   NOT NULL,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  user_agent          text,
  ip_address          text
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth.sessions (user_id);

-- ---------- auth.admin_sessions ----------
CREATE TABLE IF NOT EXISTS auth.admin_sessions (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id          text   NOT NULL UNIQUE,
  user_id             text   NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  last_activity_at    timestamptz NOT NULL DEFAULT now(),
  totp_verified_at    timestamptz,
  reauth_token_hash   text,
  reauth_valid_until  timestamptz,
  revoked_at          timestamptz,
  user_agent          text,
  ip_address          text
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON auth.admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_activity ON auth.admin_sessions (last_activity_at);

-- ---------- trading.orders ----------
CREATE TABLE IF NOT EXISTS trading.orders (
  id                 bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id           text          NOT NULL UNIQUE,
  client_order_id    text          NOT NULL,
  broker_id          text          NOT NULL REFERENCES auth.brokers(broker_id) ON DELETE RESTRICT,
  symbol             text          NOT NULL,
  side               order_side    NOT NULL,
  type               order_type    NOT NULL,
  quantity           numeric(20,4) NOT NULL,
  price              numeric(20,4),
  time_in_force      time_in_force NOT NULL,
  status             order_status  NOT NULL DEFAULT 'PENDING',
  rejection_reason   text,
  received_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_broker_received ON trading.orders (broker_id, received_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON trading.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_broker_clientid ON trading.orders (broker_id, client_order_id);

-- ---------- trading.trades (append-only) ----------
CREATE TABLE IF NOT EXISTS trading.trades (
  id           bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_id     text          NOT NULL UNIQUE,
  order_id     text          NOT NULL REFERENCES trading.orders(order_id) ON DELETE RESTRICT,
  broker_id    text          NOT NULL REFERENCES auth.brokers(broker_id) ON DELETE RESTRICT,
  symbol       text          NOT NULL,
  side         order_side    NOT NULL,
  quantity     numeric(20,4) NOT NULL,
  price        numeric(20,4) NOT NULL,
  executed_at  timestamptz   NOT NULL,
  prev_hash    text          NOT NULL,
  hash         text          NOT NULL UNIQUE,
  created_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trades_broker_executed ON trading.trades (broker_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_trades_symbol_executed ON trading.trades (symbol, executed_at);
CREATE INDEX IF NOT EXISTS idx_trades_order ON trading.trades (order_id);

-- ---------- trading.charges ----------
CREATE TABLE IF NOT EXISTS trading.charges (
  id           bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_id     text          NOT NULL REFERENCES trading.trades(trade_id) ON DELETE RESTRICT,
  type         charge_type   NOT NULL,
  amount       numeric(20,4) NOT NULL,
  description  text          NOT NULL,
  created_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_charges_trade ON trading.charges (trade_id);
CREATE INDEX IF NOT EXISTS idx_charges_type ON trading.charges (type);

-- ---------- ledger.wallets ----------
CREATE TABLE IF NOT EXISTS ledger.wallets (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_id   text   NOT NULL UNIQUE,
  broker_id   text   NOT NULL REFERENCES auth.brokers(broker_id) ON DELETE RESTRICT,
  currency    text   NOT NULL DEFAULT 'INR',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallets_broker_currency ON ledger.wallets (broker_id, currency);

-- ---------- ledger.ledger_entries (append-only) ----------
CREATE TABLE IF NOT EXISTS ledger.ledger_entries (
  id              bigint                GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id        text                  NOT NULL UNIQUE,
  wallet_id       text                  NOT NULL REFERENCES ledger.wallets(wallet_id) ON DELETE RESTRICT,
  direction       ledger_direction      NOT NULL,
  amount          numeric(20,4)         NOT NULL,
  currency        text                  NOT NULL,
  reference_type  ledger_reference_type NOT NULL,
  reference_id    text                  NOT NULL,
  description     text                  NOT NULL,
  created_at      timestamptz           NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON ledger.ledger_entries (wallet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger.ledger_entries (reference_type, reference_id);

-- ---------- audit.audit_logs (append-only) ----------
CREATE TABLE IF NOT EXISTS audit.audit_logs (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  audit_id       text   NOT NULL UNIQUE,
  actor_type     text   NOT NULL CHECK (actor_type IN ('user','broker_api','system')),
  actor_id       text   NOT NULL,
  action         text   NOT NULL,
  resource_type  text,
  resource_id    text,
  outcome        text   NOT NULL CHECK (outcome IN ('success','failure')),
  metadata       jsonb,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit.audit_logs (actor_type, actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit.audit_logs (action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit.audit_logs (resource_type, resource_id);

-- ---------- market.instruments ----------
CREATE TABLE IF NOT EXISTS market.instruments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol      text   NOT NULL UNIQUE,
  exchange    text   NOT NULL CHECK (exchange IN ('NSE','BSE')),
  segment     text   NOT NULL CHECK (segment IN ('EQ','FUT','OPT')),
  lot_size    integer NOT NULL DEFAULT 1,
  tick_size   numeric(10,4) NOT NULL DEFAULT 0.05,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instruments_segment ON market.instruments (segment);

-- ---------- market.ticks (will be made a TimescaleDB hypertable in 0001_security.sql) ----------
CREATE TABLE IF NOT EXISTS market.ticks (
  timestamp  timestamptz NOT NULL,
  symbol     text        NOT NULL,
  bid        numeric(20,4),
  ask        numeric(20,4),
  last       numeric(20,4),
  volume     numeric(20,4)
);
CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON market.ticks (symbol, timestamp);

-- ---------- admin.pending_actions (4-eyes queue) ----------
CREATE TABLE IF NOT EXISTS admin.pending_actions (
  id                bigint                  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id         text                    NOT NULL UNIQUE,
  action_type       pending_action_type     NOT NULL,
  payload           jsonb                   NOT NULL,
  reason            text                    NOT NULL,
  requested_by      text                    NOT NULL REFERENCES auth.users(user_id) ON DELETE RESTRICT,
  requested_at      timestamptz             NOT NULL DEFAULT now(),
  approved_by       text                    REFERENCES auth.users(user_id) ON DELETE RESTRICT,
  approved_at       timestamptz,
  approval_comment  text,
  rejected_by       text                    REFERENCES auth.users(user_id) ON DELETE RESTRICT,
  rejected_at       timestamptz,
  rejection_reason  text,
  executed_at       timestamptz,
  expires_at        timestamptz             NOT NULL,
  status            pending_action_status   NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON admin.pending_actions (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_pending_actions_requester ON admin.pending_actions (requested_by);
CREATE INDEX IF NOT EXISTS idx_pending_actions_type ON admin.pending_actions (action_type);
