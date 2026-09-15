import { PolicyEvaluationContext, PolicyDecision } from "../types";
import { PolicyConfig } from "../policyConfig";

export const SUPPORTED_MUTATING_TOOLS = [
  "retry_payment",
  "send_customer_notification",
  "create_support_ticket",
  "request_human_escalation",
] as const;

export const SUPPORTED_READONLY_TOOLS = [
  "get_customer",
  "get_transaction",
  "get_transaction_history",
] as const;

export const ALL_SUPPORTED_TOOLS = [
  ...SUPPORTED_MUTATING_TOOLS,
  ...SUPPORTED_READONLY_TOOLS,
] as const;

/**
 * Common Rule 1: Unknown Tool / Default Deny
 */
export function evaluateUnknownToolRule(
  context: PolicyEvaluationContext,
  _config: PolicyConfig
): PolicyDecision | null {
  const toolName = context.action.toolName;
  if (!ALL_SUPPORTED_TOOLS.includes(toolName as any)) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "COMMON_001_UNKNOWN_TOOL",
      reason: `Tool '${toolName}' is not recognized or authorized for execution. Default deny applied.`,
      evidenceReferences: {
        sessionId: context.sessionId,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }
  return null;
}

/**
 * Common Rule 2: Session Existence & Active State Integrity
 */
export function evaluateSessionIntegrityRule(
  context: PolicyEvaluationContext,
  _config: PolicyConfig
): PolicyDecision | null {
  if (!context.session) {
    return {
      verdict: "BLOCKED",
      toolName: context.action.toolName,
      ruleId: "COMMON_002_SESSION_NOT_FOUND",
      reason: `Resolution session '${context.sessionId}' does not exist.`,
      evidenceReferences: {
        sessionId: context.sessionId,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  const terminalStates = ["RESOLVED_SUCCESS", "RESOLVED_FAILURE", "ABORTED"];
  if (terminalStates.includes(context.session.currentState)) {
    return {
      verdict: "BLOCKED",
      toolName: context.action.toolName,
      ruleId: "COMMON_003_TERMINAL_SESSION",
      reason: `Session is in terminal state '${context.session.currentState}'. Further mutating actions are blocked.`,
      evidenceReferences: {
        sessionId: context.sessionId,
        currentState: context.session.currentState,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  return null;
}
