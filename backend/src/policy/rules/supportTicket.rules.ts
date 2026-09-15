import { PolicyEvaluationContext, PolicyDecision } from "../types";
import { PolicyConfig } from "../policyConfig";

export const ALLOWED_SUPPORT_CATEGORIES = [
  "PAYMENT_FAILURE",
  "BILLER_DELAY",
  "REFUND_QUERY",
] as const;

export const ALLOWED_SUPPORT_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export function evaluateSupportTicketRules(
  context: PolicyEvaluationContext,
  _config: PolicyConfig
): PolicyDecision {
  const toolName = "create_support_ticket";
  const params = context.action.params || {};
  const sessionId = context.sessionId;

  // ST_001: Customer Existence Check
  if (!context.customer) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ST_001",
      reason: "Customer record not found. Cannot create support ticket.",
      evidenceReferences: { sessionId, customerId: context.session?.customerId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ST_002: Issue Category Whitelist Check
  const category = (params.issueCategory as string) || "PAYMENT_FAILURE";
  if (!ALLOWED_SUPPORT_CATEGORIES.includes(category as any)) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ST_002",
      reason: `Support category '${category}' is invalid. Allowed: [${ALLOWED_SUPPORT_CATEGORIES.join(
        ", "
      )}].`,
      evidenceReferences: { sessionId, category, allowedCategories: ALLOWED_SUPPORT_CATEGORIES },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ST_003: Summary Non-Empty Check
  const summary = params.summary;
  if (!summary || typeof summary !== "string" || summary.trim().length === 0) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ST_003",
      reason: "Support ticket summary must be a non-empty string.",
      evidenceReferences: { sessionId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ST_004: Priority Validation Check
  const priority = (params.priority as string) || "MEDIUM";
  if (!ALLOWED_SUPPORT_PRIORITIES.includes(priority as any)) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ST_004",
      reason: `Priority '${priority}' is invalid. Allowed: [${ALLOWED_SUPPORT_PRIORITIES.join(
        ", "
      )}].`,
      evidenceReferences: { sessionId, priority, allowedPriorities: ALLOWED_SUPPORT_PRIORITIES },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ST_005: All Checks Passed
  return {
    verdict: "ALLOWED",
    toolName,
    ruleId: "ST_005",
    reason: `Support ticket authorized under queue category '${category}' with priority '${priority}'.`,
    evidenceReferences: {
      sessionId,
      customerId: context.customer.customerId,
      category,
      priority,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
