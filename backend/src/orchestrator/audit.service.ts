import { prisma } from "../config/db";
import { AuditStage } from "../types";

export interface LogAuditOptions {
  sessionId: string;
  stage: AuditStage;
  decisionSummary?: string | null;
  contextReferences?: Record<string, unknown> | null;
  details: Record<string, unknown>;
}

export class AuditService {
  /**
   * Persists an auditable lifecycle event without storing private chain-of-thought.
   */
  async logEvent(options: LogAuditOptions): Promise<void> {
    try {
      await prisma.auditLogEntry.create({
        data: {
          sessionId: options.sessionId,
          stage: options.stage,
          decisionSummary: options.decisionSummary || null,
          contextReferences: (options.contextReferences as any) || undefined,
          details: options.details as any,
        },
      });
    } catch (error) {
      console.error("Failed to write audit log entry:", error);
    }
  }
}

export const auditService = new AuditService();
