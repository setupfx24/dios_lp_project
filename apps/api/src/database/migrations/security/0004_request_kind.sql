-- =============================================================================
-- 0004_request_kind.sql
-- Hand-written, idempotent. The deposit_requests table now also carries
-- WITHDRAWAL requests, distinguished by `kind`. Approving a deposit CREDITs the
-- wallet; approving a withdrawal DEBITs it. Withdrawals are capped client- and
-- server-side so the broker can only pull out the balance above a fixed floor.
-- =============================================================================

ALTER TABLE ledger.deposit_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'deposit';
