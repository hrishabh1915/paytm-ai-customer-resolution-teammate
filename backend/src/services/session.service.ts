import { prisma } from "../config/db";
import { AuditStage } from "../types";
import { IntakeInput, IntakeResponse } from "../types/intake.types";
import { NotFoundError, BadRequestError } from "../types/errors";

export class SessionService {
  /**
   * Process customer intake and initialize a new resolution session.
   */
  async processIntake(input: IntakeInput): Promise<IntakeResponse> {
    // 1. Verify customer exists
    const customer = await prisma.syntheticCustomer.findUnique({
      where: { customerId: input.customerId },
    });

    if (!customer) {
      throw new NotFoundError(`Customer '${input.customerId}' not found`);
    }

    // 2. Verify transaction exists
    const transaction = await prisma.syntheticTransaction.findUnique({
      where: { transactionId: input.transactionId },
    });

    if (!transaction) {
      throw new NotFoundError(`Transaction '${input.transactionId}' not found`);
    }

    // 3. Verify transaction belongs to the customer
    if (transaction.customerId !== input.customerId) {
      throw new BadRequestError(
        `Transaction '${input.transactionId}' does not belong to customer '${input.customerId}'`
      );
    }

    // 4. Create ResolutionSession and AuditLogEntry atomically
    const session = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.resolutionSession.create({
        data: {
          customerId: input.customerId,
          targetTransactionId: input.transactionId,
          statedObjective: input.statedObjective,
          currentState: "INIT",
        },
      });

      await tx.auditLogEntry.create({
        data: {
          sessionId: createdSession.sessionId,
          stage: AuditStage.INTAKE,
          decisionSummary: "Customer complaint intake received and resolution session initialized.",
          contextReferences: {
            customerId: input.customerId,
            transactionId: input.transactionId,
          },
          details: {
            statedObjective: input.statedObjective,
            initialState: "INIT",
            outcomeStatus: createdSession.outcomeStatus,
          },
        },
      });

      return createdSession;
    });

    // 5. Return concise session summary
    return {
      sessionId: session.sessionId,
      currentState: session.currentState,
      outcomeStatus: session.outcomeStatus,
    };
  }
}

export const sessionService = new SessionService();
