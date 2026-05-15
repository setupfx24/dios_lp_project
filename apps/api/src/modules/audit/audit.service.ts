import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AuditRepository, type AuditEntryInput } from './audit.repository.js';

export const AUDIT_EVENT = 'audit.recorded';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly repo: AuditRepository) {}

  async record(entry: AuditEntryInput): Promise<void> {
    try {
      await this.repo.insert(entry);
    } catch (err) {
      // Audit failures must never crash a request handler. They are logged
      // separately so the underlying business operation still completes.
      this.logger.error({ err, entry }, 'Failed to write audit log');
    }
  }

  @OnEvent(AUDIT_EVENT, { async: true })
  async onAuditEvent(entry: AuditEntryInput): Promise<void> {
    await this.record(entry);
  }
}
