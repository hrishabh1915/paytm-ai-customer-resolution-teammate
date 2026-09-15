import { prisma } from "../config/db";
import { TransactionStatus } from "../types";

export type OutcomeVerificationStatus =
  | "VERIFIED_SUCCESS"
  | "VERIFIED_FAILURE"
  | "INCONCLUSIVE";

export interface OutcomeVerificationResult {
  status: OutcomeVerificationStatus;
  verifiedTransactionId?: string;
  reason: string;
  details: Record<string, unknown>;
}

export class OutcomeVerifier {
  /**
   * Independently verifies against PostgreSQL whether the business objective
   * (e.g. payment recovery) has truly succeeded.
   * Completely isolated from LLM claims.
   */
  async verifyPaymentOutcome(
    sessionId: string,
    targetTransactionId?: string | null
  ): Promise<OutcomeVerificationResult> {
    const session = await prisma.resolutionSession.findUnique({
      where: { sessionId },
      include: {
        actionSteps: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!session) {
      return {
        status: "VERIFIED_FAILURE",
        reason: `Session '${sessionId}' does not exist.`,
        details: { sessionId },
      };
    }

    const txnId = targetTransactionId || session.targetTransactionId;
    if (!txnId) {
      return {
        status: "INCONCLUSIVE",
        reason: "No target transaction ID associated with this session to verify.",
        details: { sessionId },
      };
    }

    // 1. Check if the original transaction itself is already in SUCCESS status
    const originalTxn = await prisma.syntheticTransaction.findUnique({
      where: { transactionId: txnId },
    });

    if (originalTxn && originalTxn.status === TransactionStatus.SUCCESS) {
      return {
        status: "VERIFIED_SUCCESS",
        verifiedTransactionId: originalTxn.transactionId,
        reason: `Target transaction '${txnId}' is confirmed SUCCESS in authoritative store.`,
        details: {
          transactionId: originalTxn.transactionId,
          amount: originalTxn.amount.toNumber(),
          billerOrMerchant: originalTxn.billerOrMerchant,
          status: originalTxn.status,
        },
      };
    }

    // 2. Check if a successful retry payment step was executed for this session
    const successfulRetryStep = session.actionSteps.find(
      (s) =>
        s.toolName === "retry_payment" &&
        s.executionStatus === "SUCCESS" &&
        s.executionResult !== null
    );

    if (successfulRetryStep) {
      const resultObj = successfulRetryStep.executionResult as any;
      const newTxnId = resultObj?.newTransactionId;

      if (newTxnId) {
        const newTxn = await prisma.syntheticTransaction.findUnique({
          where: { transactionId: newTxnId },
        });

        if (newTxn && newTxn.status === TransactionStatus.SUCCESS) {
          return {
            status: "VERIFIED_SUCCESS",
            verifiedTransactionId: newTxn.transactionId,
            reason: `Payment recovery verified: new transaction '${newTxn.transactionId}' is confirmed SUCCESS with biller acknowledgment.`,
            details: {
              originalTransactionId: txnId,
              newTransactionId: newTxn.transactionId,
              amount: newTxn.amount.toNumber(),
              billerOrMerchant: newTxn.billerOrMerchant,
              status: newTxn.status,
              billerAckId: resultObj?.billerAckId,
            },
          };
        }
      }
    }

    // 3. If any retry step has FAILED or no success recorded
    const failedRetryStep = session.actionSteps.find(
      (s) => s.toolName === "retry_payment" && s.executionStatus === "FAILED"
    );

    if (failedRetryStep) {
      return {
        status: "VERIFIED_FAILURE",
        reason: "Payment retry attempt failed to settle with the biller.",
        details: {
          originalTransactionId: txnId,
          errorMessage: failedRetryStep.errorMessage,
        },
      };
    }

    return {
      status: "INCONCLUSIVE",
      reason: "No successful payment clearing record found in authoritative store.",
      details: { originalTransactionId: txnId },
    };
  }
}

export const outcomeVerifier = new OutcomeVerifier();
