import React from "react";
import { ShieldCheck, CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react";
import type { SessionStatusResponse, PolicyVerdict } from "../types/api";

interface PolicyEnginePanelProps {
  session?: SessionStatusResponse | null;
}

export const PolicyEnginePanel: React.FC<PolicyEnginePanelProps> = ({ session }) => {
  const actionSteps = session?.actionSteps || [];
  const latestStep = actionSteps[actionSteps.length - 1];
  const auditLogs = session?.auditLogEntries || [];
  const latestPolicyLog = [...auditLogs]
    .reverse()
    .find((l) => l.stage === "POLICY_EVALUATED");

  const policyDetails = latestPolicyLog?.details as Record<string, unknown> | undefined;
  const verdict: PolicyVerdict | "PENDING" =
    latestStep?.policyVerdict ||
    (policyDetails?.verdict as PolicyVerdict) ||
    "PENDING";

  const ruleId =
    latestStep?.policyRuleTriggered ||
    (policyDetails?.ruleId as string) ||
    "Awaiting Evaluation";

  const reason =
    latestPolicyLog?.decisionSummary ||
    (policyDetails?.reason as string) ||
    "Policy Engine evaluates all proposed actions deterministically against strict business guardrails.";

  let verdictClass = "pending";
  let verdictColor = "var(--text-muted)";
  let verdictIcon = <Info size={16} />;
  let verdictTitle = "AWAITING PROPOSAL";
  let authorizationStatus = "NO ACTION EVALUATED";

  if (verdict === "ALLOWED") {
    verdictClass = "allowed";
    verdictColor = "var(--accent-green)";
    verdictIcon = <CheckCircle size={16} />;
    verdictTitle = "ALLOWED";
    authorizationStatus = "EXECUTION AUTHORIZED";
  } else if (verdict === "BLOCKED") {
    verdictClass = "blocked";
    verdictColor = "var(--accent-red)";
    verdictIcon = <XCircle size={16} />;
    verdictTitle = "BLOCKED";
    authorizationStatus = "EXECUTION PREVENTED (GUARDRAIL TRIGGERED)";
  } else if (verdict === "REQUIRES_HUMAN") {
    verdictClass = "requires-human";
    verdictColor = "var(--accent-amber)";
    verdictIcon = <AlertTriangle size={16} />;
    verdictTitle = "REQUIRES HUMAN";
    authorizationStatus = "HUMAN SUPERVISOR APPROVAL REQUIRED";
  }

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <div className="panel-icon policy">
            <ShieldCheck size={18} />
          </div>
          <div className="panel-title">Policy Engine (Decides)</div>
        </div>
        <span
          className="panel-tag"
          style={{
            background: verdictClass === "allowed" ? "rgba(16, 185, 129, 0.15)" : verdictClass === "blocked" ? "rgba(239, 68, 68, 0.15)" : verdictClass === "requires-human" ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.05)",
            color: verdictColor,
          }}
        >
          {ruleId}
        </span>
      </div>

      <div className="panel-body">
        {/* Verdict Box */}
        <div className={`verdict-box ${verdictClass}`}>
          <div className="verdict-header">
            <span className="kv-label" style={{ color: verdictColor }}>
              Deterministic Verdict
            </span>
            <span style={{ color: verdictColor, display: "flex", alignItems: "center", gap: 5 }}>
              {verdictIcon}
            </span>
          </div>
          <div className="verdict-title" style={{ color: verdictColor }}>
            {verdictTitle}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: verdictColor }}>
            {authorizationStatus}
          </div>
        </div>

        {/* Rule Triggered */}
        <div className="kv-item">
          <span className="kv-label">Rule Triggered</span>
          <span className="kv-value mono" style={{ color: verdictColor }}>
            {ruleId}
          </span>
        </div>

        {/* Deterministic Reason */}
        <div className="kv-item">
          <span className="kv-label">Deterministic Reason</span>
          <span className="kv-value" style={{ fontSize: 12.5 }}>
            {reason}
          </span>
        </div>

        {/* Core Invariant Callout */}
        <div className="callout-box amber" style={{ marginTop: "auto" }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <ShieldCheck size={13} /> AI PROPOSAL ≠ AUTHORIZATION
          </div>
          Deterministic Policy Engine decides whether an action may execute. The AI cannot bypass, modify, or soften policy rules.
        </div>
      </div>
    </div>
  );
};
