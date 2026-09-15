import {
  ProposedAction,
  PolicyEvaluationContext,
  PolicyDecision,
} from "./types";
import { PolicyConfig, policyConfig, DEFAULT_POLICY_CONFIG } from "./policyConfig";
import { policyContextLoader } from "./contextLoader";
import {
  evaluateUnknownToolRule,
  evaluateSessionIntegrityRule,
  SUPPORTED_READONLY_TOOLS,
} from "./rules/common.rules";
import { evaluateRetryPaymentRules } from "./rules/retryPayment.rules";
import { evaluateNotificationRules } from "./rules/notification.rules";
import { evaluateSupportTicketRules } from "./rules/supportTicket.rules";
import { evaluateHumanEscalationRules } from "./rules/humanEscalation.rules";

export class PolicyEngine {
  /**
   * Pure deterministic evaluation function.
   * Does NOT query DB or execute tools.
   */
  evaluate(
    context: PolicyEvaluationContext,
    config: PolicyConfig = policyConfig || DEFAULT_POLICY_CONFIG
  ): PolicyDecision {
    // 1. Check Unknown Tool / Default Deny Rule
    const unknownToolDecision = evaluateUnknownToolRule(context, config);
    if (unknownToolDecision) {
      return unknownToolDecision;
    }

    // 2. Explicitly handle Read-Only Tools
    if (
      SUPPORTED_READONLY_TOOLS.includes(
        context.action.toolName as (typeof SUPPORTED_READONLY_TOOLS)[number]
      )
    ) {
      return {
        verdict: "ALLOWED",
        toolName: context.action.toolName,
        ruleId: "READONLY_001_PERMITTED",
        reason: `Read-only tool '${context.action.toolName}' has no side effects and is permitted.`,
        evidenceReferences: {
          sessionId: context.sessionId,
        },
        evaluatedAt: new Date().toISOString(),
      };
    }

    // 3. Check Session Integrity
    const sessionDecision = evaluateSessionIntegrityRule(context, config);
    if (sessionDecision) {
      return sessionDecision;
    }

    // 4. Dispatch to Specific Mutating/Human Tool Rule Sets
    switch (context.action.toolName) {
      case "retry_payment":
        return evaluateRetryPaymentRules(context, config);

      case "send_customer_notification":
        return evaluateNotificationRules(context, config);

      case "create_support_ticket":
        return evaluateSupportTicketRules(context, config);

      case "request_human_escalation":
        return evaluateHumanEscalationRules(context, config);

      default:
        // Fail-safe fallthrough: default deny
        return {
          verdict: "BLOCKED",
          toolName: context.action.toolName,
          ruleId: "COMMON_001_UNKNOWN_TOOL",
          reason: `No policy rule mapped for tool '${context.action.toolName}'. Default deny applied.`,
          evidenceReferences: {
            sessionId: context.sessionId,
          },
          evaluatedAt: new Date().toISOString(),
        };
    }
  }

  /**
   * Evaluates an AI-proposed action by first loading authoritative context from the DB,
   * then running the pure evaluation engine.
   */
  async evaluateProposedAction(
    sessionId: string,
    action: ProposedAction,
    customConfig?: PolicyConfig
  ): Promise<PolicyDecision> {
    const config = customConfig || policyConfig || DEFAULT_POLICY_CONFIG;

    const context = await policyContextLoader.loadContext(sessionId, action);

    if (!context) {
      return {
        verdict: "BLOCKED",
        toolName: action.toolName,
        ruleId: "CONTEXT_001_LOAD_FAILED",
        reason: `Failed to load authoritative context for session '${sessionId}'. Action is blocked for safety.`,
        evidenceReferences: { sessionId },
        evaluatedAt: new Date().toISOString(),
      };
    }

    return this.evaluate(context, config);
  }
}

export const policyEngine = new PolicyEngine();
