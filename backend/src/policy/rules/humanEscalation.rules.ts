import { PolicyEvaluationContext, PolicyDecision } from "../types";
import { PolicyConfig } from "../policyConfig";
import { ALL_SUPPORTED_TOOLS } from "./common.rules";

export function evaluateHumanEscalationRules(
  context: PolicyEvaluationContext,
  _config: PolicyConfig
): PolicyDecision {
  const toolName = "request_human_escalation";
  const params = context.action.params || {};
  const sessionId = context.sessionId;

  // ESC_001: Session Integrity
  if (!context.session) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ESC_001",
      reason: `Resolution session '${sessionId}' was not found.`,
      evidenceReferences: { sessionId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ESC_002: Step Binding Check
  const stepId = params.stepId as string;
  if (!stepId || typeof stepId !== "string") {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ESC_002",
      reason: "Missing 'stepId' parameter for human escalation.",
      evidenceReferences: { sessionId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  const matchingStep = (context.actionStepsInSession || []).find(
    (s) => s.stepId === stepId
  );

  if (!matchingStep) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ESC_002",
      reason: `Action step '${stepId}' does not belong to session '${sessionId}'.`,
      evidenceReferences: { sessionId, stepId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ESC_003: Duplicate Pending Review Check
  const hasPendingReview = (context.pendingReviewsInSession || []).length > 0;
  if (hasPendingReview) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ESC_003",
      reason: `A pending human review already exists for session '${sessionId}'. Duplicate escalation is blocked.`,
      evidenceReferences: {
        sessionId,
        pendingReviewsCount: context.pendingReviewsInSession?.length,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ESC_004: Proposed Tool Validity Check
  const proposedTool = params.proposedTool as string;
  if (!proposedTool || !ALL_SUPPORTED_TOOLS.includes(proposedTool as any)) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ESC_004",
      reason: `Proposed tool '${proposedTool}' is not a valid supported action.`,
      evidenceReferences: { sessionId, stepId, proposedTool },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ESC_005: Reason Non-Empty Check
  const reason = params.reason;
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "ESC_005",
      reason: "Escalation reason must be a non-empty string.",
      evidenceReferences: { sessionId, stepId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // ESC_006: All Checks Passed
  return {
    verdict: "ALLOWED",
    toolName,
    ruleId: "ESC_006",
    reason: "Explicit human escalation request is authorized.",
    evidenceReferences: {
      sessionId,
      stepId,
      proposedTool,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
