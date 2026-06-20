-- =============================================================================
-- 0003_order_client_user_id.sql
-- Hand-written, idempotent. Adds the upstream broker's end-user id to orders
-- so the broker/admin portals can show a stable "User ID" per trade (dios
-- forwards the DIOS user's _id alongside the existing display label).
-- =============================================================================

ALTER TABLE trading.orders ADD COLUMN IF NOT EXISTS client_user_id text;
