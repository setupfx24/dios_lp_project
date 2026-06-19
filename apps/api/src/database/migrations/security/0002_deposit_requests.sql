-- =============================================================================
-- 0002_deposit_requests.sql
-- Hand-written, idempotent. Broker-initiated deposit (funding) requests.
--
-- Flow: a broker submits a PENDING request from the wallet page (amount +
-- payment method). An admin reviews it and either APPROVES — which credits the
-- broker wallet with a DEPOSIT ledger entry — or REJECTS it. This table is NOT
-- append-only: its `status` mutates from PENDING -> APPROVED/REJECTED, so
-- lp_app keeps UPDATE here (the immutable money record is the ledger entry).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ledger.deposit_requests (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id    text NOT NULL UNIQUE,
  broker_id     text NOT NULL REFERENCES auth.brokers(broker_id) ON DELETE RESTRICT,
  amount        numeric(20, 4) NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  method        text NOT NULL DEFAULT 'manual',
  reference     text,
  note          text,
  status        text NOT NULL DEFAULT 'PENDING',
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_broker ON ledger.deposit_requests (broker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON ledger.deposit_requests (status);

-- The table is created by the postgres superuser on prod, so lp_owner's
-- ALTER DEFAULT PRIVILEGES don't apply — grant the app role explicitly.
GRANT SELECT, INSERT, UPDATE ON ledger.deposit_requests TO lp_app;
GRANT SELECT ON ledger.deposit_requests TO lp_readonly;
