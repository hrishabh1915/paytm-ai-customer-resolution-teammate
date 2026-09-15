import { prisma } from "../config/db";
import { ProposedAction, PolicyEvaluationContext } from "./types";
import { HumanReviewStatus } from "../types";

export class PolicyContextLoader {
  /**
   * Authoritatively loads all database context needed for policy evaluation.
   * Does NOT trust AI-provided params as ground truth.
   */
  async loadContext(
    sessionId: string,
    action: ProposedAction
  ): Promise<PolicyEvaluationContext | null> {
    try {
      // 1. Load authoritative session
      const sessionRecord = await prisma.resolutionSession.findUnique({
        where: { sessionId },
        include: {
          actionSteps: {
            orderBy: { createdAt: "asc" },
          },
          humanReviews: {
            where: { status: HumanReviewStatus.PENDING },
          },
        },
      });

      if (!sessionRecord) {
        return null;
      }

      // 2. Load authoritative customer
      const customerRecord = await prisma.syntheticCustomer.findUnique({
        where: { customerId: sessionRecord.customerId },
      });

      // 3. Load authoritative transaction (using session targetTransactionId or param if present)
      const targetTxnId =
        (typeof action.params?.originalTransactionId === "string" &&
          action.params.originalTransactionId) ||
        (typeof action.params?.transactionId === "string" &&
          action.params.transactionId) ||
        sessionRecord.targetTransactionId;

      let transactionRecord = null;
      if (targetTxnId) {
        transactionRecord = await prisma.syntheticTransaction.findUnique({
          where: { transactionId: targetTxnId },
        });
      }

      return {
        sessionId,
        action,
        session: {
          sessionId: sessionRecord.sessionId,
          customerId: sessionRecord.customerId,
          targetTransactionId: sessionRecord.targetTransactionId,
          currentState: sessionRecord.currentState,
          retryCount: sessionRecord.retryCount,
          maxRetries: sessionRecord.maxRetries,
          outcomeStatus: sessionRecord.outcomeStatus,
        },
        customer: customerRecord
          ? {
              customerId: customerRecord.customerId,
              name: customerRecord.name,
              phone: customerRecord.phone,
              accountStatus: customerRecord.accountStatus,
              syntheticBalance: customerRecord.syntheticBalance.toNumber(),
            }
          : null,
        transaction: transactionRecord
          ? {
              transactionId: transactionRecord.transactionId,
              customerId: transactionRecord.customerId,
              amount: transactionRecord.amount.toNumber(),
              billerOrMerchant: transactionRecord.billerOrMerchant,
              status: transactionRecord.status,
              failureReason: transactionRecord.failureReason,
              idempotencyKey: transactionRecord.idempotencyKey,
            }
          : null,
        actionStepsInSession: sessionRecord.actionSteps.map((step) => ({
          stepId: step.stepId,
          sessionId: step.sessionId,
          toolName: step.toolName,
          toolParams: step.toolParams,
          policyVerdict: step.policyVerdict,
          executionStatus: step.executionStatus,
          executionResult: step.executionResult,
        })),
        pendingReviewsInSession: sessionRecord.humanReviews.map((rev) => ({
          reviewId: rev.reviewId,
          sessionId: rev.sessionId,
          stepId: rev.stepId,
          status: rev.status,
        })),
      };
    } catch (error) {
      console.error("PolicyContextLoader error loading context:", error);
      return null;
    }
  }
}

export const policyContextLoader = new PolicyContextLoader();
