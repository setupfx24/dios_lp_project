import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Postgres namespaces. Public schema is intentionally left empty —
 * dumping everything there is an anti-pattern.
 */
export const trading = pgSchema('trading');
export const ledger = pgSchema('ledger');
export const audit = pgSchema('audit');
export const market = pgSchema('market');
export const auth = pgSchema('auth');
export const admin = pgSchema('admin');
