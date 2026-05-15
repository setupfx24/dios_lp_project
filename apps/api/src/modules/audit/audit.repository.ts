import { Inject, Injectable } from '@nestjs/common';

import { ulid } from '@lp/utils';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import { auditLogs, type NewAuditLogRow } from './schema/audit.schema.js';

export interface AuditEntryInput {
  actorType: 'user' | 'broker_api' | 'system';
  actorId: string;
  action: string;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class AuditRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async insert(entry: AuditEntryInput): Promise<{ auditId: string }> {
    const auditId = ulid();
    const row: NewAuditLogRow = {
      auditId,
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      outcome: entry.outcome,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    };
    await this.db.insert(auditLogs).values(row);
    return { auditId };
  }
}
