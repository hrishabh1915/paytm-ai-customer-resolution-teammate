import { PolicyEvaluationContext, PolicyDecision } from "../types";
import { PolicyConfig } from "../policyConfig";
import { CustomerAccountStatus, ActionExecutionStatus } from "../../types";

export function evaluateNotificationRules(
  context: PolicyEvaluationContext,
  config: PolicyConfig
): PolicyDecision {
  const toolName = "send_customer_notification";
  const params = context.action.params || {};
  const sessionId = context.sessionId;

  // NOTIF_001: Customer Existence
  if (!context.customer) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "NOTIF_001",
      reason: "Customer record not found. Cannot dispatch notification.",
      evidenceReferences: { sessionId, customerId: context.session?.customerId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // NOTIF_002: Customer Account Standing Check
  if (context.customer.accountStatus === CustomerAccountStatus.SUSPENDED) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "NOTIF_002",
      reason: `Customer account is SUSPENDED. Customer notifications are blocked.`,
      evidenceReferences: {
        sessionId,
        customerId: context.customer.customerId,
        accountStatus: context.customer.accountStatus,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // NOTIF_003: Channel Whitelist Check
  const channel = (params.channel as string) || "IN_APP";
  if (!config.allowedNotificationChannels.includes(channel)) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "NOTIF_003",
      reason: `Notification channel '${channel}' is not in allowed channels [${config.allowedNotificationChannels.join(
        ", "
      )}].`,
      evidenceReferences: { sessionId, channel, allowedChannels: config.allowedNotificationChannels },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // NOTIF_004: Message Non-Empty Check
  const message = params.message;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "NOTIF_004",
      reason: "Notification message must be a non-empty string.",
      evidenceReferences: { sessionId },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // NOTIF_005: Prevent Duplicate Successful Notification
  const alreadySent = (context.actionStepsInSession || []).some(
    (s) =>
      s.toolName === "send_customer_notification" &&
      s.executionStatus === ActionExecutionStatus.SUCCESS &&
      (s.toolParams as any)?.message === message
  );

  if (alreadySent) {
    return {
      verdict: "BLOCKED",
      toolName,
      ruleId: "NOTIF_005",
      reason: "An identical customer notification was already successfully dispatched in this session.",
      evidenceReferences: { sessionId, message },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // NOTIF_006: All Checks Passed
  return {
    verdict: "ALLOWED",
    toolName,
    ruleId: "NOTIF_006",
    reason: `Notification authorized for delivery via '${channel}'.`,
    evidenceReferences: {
      sessionId,
      customerId: context.customer.customerId,
      channel,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
