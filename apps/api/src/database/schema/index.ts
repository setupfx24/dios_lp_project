// Barrel export of every Drizzle pgTable in the codebase.
// Drizzle's connection initializer needs all schemas in one object so it
// can wire up relations and migrations.

export * from '../schemas.js';

export * from '../../modules/auth/schema/user.schema.js';
export * from '../../modules/brokers/schema/broker.schema.js';
export * from '../../modules/orders/schema/order.schema.js';
export * from '../../modules/trades/schema/trade.schema.js';
export * from '../../modules/charges/schema/charge.schema.js';
export * from '../../modules/ledger/schema/ledger.schema.js';
export * from '../../modules/audit/schema/audit.schema.js';
export * from '../../modules/market/schema/market.schema.js';
export * from '../../modules/admin/schema/pending-actions.schema.js';
