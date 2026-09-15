import { PolicyEvaluationContext, PolicyDecision } from "../types";
import { PolicyConfig } from "../policyConfig";
import { CustomerAccountStatus, TransactionStatus } from "../../types";

export function evaluateRetryPaymentRules(
  context: PolicyEvaluationContext,
  config: PolicyConfig
): PolicyDecision {
  const toolName = "retry_payment";
  const params = context.action.params || {};
  const sessionId = context.sessionId;

  // RP_001: Idempotency Key Check
  const idempotencyKey = params.idempotencyKey;
  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_001",
      reason: "Missing or empty 'idempotencyKey'. A valid unique idempotency key is required.",
      evidenceReferences: { sessionId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // RP_002: Customer Account Standing Check
  if (!context.customer) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_002",
      reason: "Customer record not found for this session.",
      evidenceReferences: { sessionId, customerId: context.session?.customerId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  if (context.customer.accountStatus !== CustomerAccountStatus.ACTIVE) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_002",
      reason: `Customer account status is '${context.customer.accountStatus}'. Mutating financial actions are strictly forbidden on non-active accounts.`,
      evidenceReferences: {
        sessionId,
        customerId: context.customer.customerId,
        accountStatus: context.customer.accountStatus,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // RP_003: Transaction Existence & Session/Customer Binding
  const originalTxnId = params.originalTransactionId;
  if (!originalTxnId || typeof originalTxnId !== "string") {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_003",
      reason: "Missing 'originalTransactionId' parameter.",
      evidenceReferences: { sessionId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  if (!context.transaction) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_003",
      reason: `Original transaction '${originalTxnId}' was not found in database.`,
      evidenceReferences: { sessionId, transactionId: originalTxnId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  if (context.session.targetTransactionId && context.session.targetTransactionId !== originalTxnId) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_003",
      reason: `Transaction '${originalTxnId}' does not match session target transaction '${context.session.targetTransactionId}'.`,
      evidenceReferences: {
        sessionId,
        transactionId: originalTxnId,
        targetTransactionId: context.session.targetTransactionId,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  if (context.transaction.customerId !== context.customer.customerId) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_003",
      reason: `Transaction '${originalTxnId}' belongs to customer '${context.transaction.customerId}', not the session customer '${context.customer.customerId}'.`,
      evidenceReferences: {
        sessionId,
        transactionId: originalTxnId,
        transactionCustomerId: context.transaction.customerId,
        sessionCustomerId: context.customer.customerId,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // RP_004: Transaction Precondition Check
  if (context.transaction.status !== TransactionStatus.FAILED_AT_BANK) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_004",
      reason: `Transaction status is '${context.transaction.status}'. Retrying is only allowed for transactions with status 'FAILED_AT_BANK'.`,
      evidenceReferences: {
        sessionId,
        transactionId: originalTxnId,
        status: context.transaction.status,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // RP_005: Automated Retry Quota Check
  const executedRetries = (context.actionStepsInSession || []).filter(
    (s) => s.toolName === "retry_payment" && s.executionStatus !== "SKIPPED"
  ).length;

  if (executedRetries >= config.maxRetriesPerSession) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "RP_005",
      reason: `Session has already attempted ${executedRetries} automated retry (max allowed: ${config.maxRetriesPerSession}).`,
      evidenceReferences: {
        sessionId,
        attemptCount: executedRetries,
        maxRetries: config.maxRetriesPerSession,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // RP_006: Financial Autonomous Threshold Check
  const authoritativeAmount = context.transaction.amount;
  if (authoritativeAmount > config.maxAutonomousRetryAmount) {
    return {
      verdict: "REQUIRES_HUMAN",
      toolName,
      ruleId: "RP_006",
      reason: `Transaction amount ₹${authoritativeAmount.toFixed(
        2
      )} exceeds the autonomous retry threshold of ₹${config.maxAutonomousRetryAmount.toFixed(
        2
      )}. Supervisor review required.`,
      evidenceReferences: {
        sessionId,
        customerId: context.customer.customerId,
        transactionId: originalTxnId,
        evaluatedAmount: authoritativeAmount,
        threshold: config.maxAutonomousRetryAmount,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // RP_007: All Guardrails Passed
  return {
    verdict: "ALLOWED",
    toolName,
    ruleId: "RP_007",
    reason: `All deterministic preconditions and limits passed for retrying ₹${authoritativeAmount.toFixed(
      2
    )}.`,
    evidenceReferences: {
      sessionId,
      customerId: context.customer.customerId,
      transactionId: originalTxnId,
      evaluatedAmount: authoritativeAmount,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
