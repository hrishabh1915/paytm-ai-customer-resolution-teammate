import React from "react";
import { Zap, CheckCircle2, Database, CheckCheck } from "lucide-react";
import type { SessionStatusResponse } from "../types/api";

interface ExecutionAndOutcomePanelProps {
  session?: SessionStatusResponse | null;
}

export const ExecutionAndOutcomePanel: React.FC<ExecutionAndOutcomePanelProps> = ({ session }) => {
  const actionSteps = session?.actionSteps || [];
  const latestStep = actionSteps[actionSteps.length - 1];
  const outcomeStatus = session?.outcomeStatus || "IN_PROGRESS";

  // Check outcome verification audit log
  const auditLogs = session?.auditLogEntries || [];
  const latestOutcomeLog = [...auditLogs]
    .reverse()
    .find((l) => l.stage === "OUTCOME_VERIFIED");

  const outcomeReason =
    latestOutcomeLog?.decisionSummary ||
    (outcomeStatus === "VERIFIED_SUCCESS"
      ? "Target transaction verified SUCCESS in PostgreSQL ground truth."
      : outcomeStatus === "VERIFIED_FAILURE"
      ? "Session terminated in verified failure."
      : "Awaiting outcome verification against PostgreSQL ground truth.");

  const isOutcomeSuccess = outcomeStatus === "VERIFIED_SUCCESS";
  const isOutcomeFailure = outcomeStatus === "VERIFIED_FAILURE";

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <div className="panel-icon action">
            <CheckCircle2 size={18} />
          </div>
          <div className="panel-title">Action & Outcome Verifier</div>
        </div>
        <span
          className="panel-tag"
          style={{
            background: isOutcomeSuccess
              ? "rgba(16, 185, 129, 0.15)"
              : isOutcomeFailure
              ? "rgba(239, 68, 68, 0.15)"
              : "rgba(0, 186, 242, 0.15)",
            color: isOutcomeSuccess
              ? "var(--accent-green)"
              : isOutcomeFailure
              ? "var(--accent-red)"
              : "var(--paytm-cyan)",
          }}
        >
          {outcomeStatus}
        </span>
      </div>

      <div className="panel-body">
        {/* Tool Execution Section */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="kv-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Zap size={13} color="var(--paytm-cyan)" /> Tool Execution (System Acts)
            </span>
            <span
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color:
                  latestStep?.executionStatus === "SUCCESS"
                    ? "var(--accent-green)"
                    : latestStep?.executionStatus === "SKIPPED"
                    ? "var(--accent-amber)"
                    : latestStep?.executionStatus === "FAILED"
                    ? "var(--accent-red)"
                    : "var(--text-muted)",
              }}
            >
              {latestStep?.executionStatus || "AWAITING"}
            </span>
          </div>

          <div className="kv-item">
            <span className="kv-label">Executed Tool</span>
            <span className="kv-value mono" style={{ color: "var(--paytm-cyan)" }}>
              {latestStep?.toolName || "None executed"}
            </span>
          </div>

          {latestStep && (
            <div className="kv-item">
              <span className="kv-label">Step ID & Idempotency Key</span>
              <span className="kv-value mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                idemp_{latestStep.stepId.slice(0, 12)}...
              </span>
            </div>
          )}
        </div>

        {/* Outcome Verification Section */}
        <div
          style={{
            background: isOutcomeSuccess
              ? "rgba(16, 185, 129, 0.08)"
              : isOutcomeFailure
              ? "rgba(239, 68, 68, 0.08)"
              : "var(--bg-card)",
            border: `1px solid ${
              isOutcomeSuccess
                ? "rgba(16, 185, 129, 0.3)"
                : isOutcomeFailure
                ? "rgba(239, 68, 68, 0.3)"
                : "var(--border-color)"
            }`,
            borderRadius: "var(--radius-md)",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="kv-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Database size={13} color="var(--accent-green)" /> Outcome Verifier (PostgreSQL)
            </span>
            <span
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isOutcomeSuccess
                  ? "var(--accent-green)"
                  : isOutcomeFailure
                  ? "var(--accent-red)"
                  : "var(--text-muted)",
              }}
            >
              {outcomeStatus}
            </span>
          </div>

          <div className="kv-item">
            <span className="kv-label">Authoritative Verification</span>
            <span className="kv-value" style={{ fontSize: 12 }}>
              {outcomeReason}
            </span>
          </div>
        </div>

        {/* Core Invariant Callout */}
        <div className="callout-box green" style={{ marginTop: "auto" }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <CheckCheck size={13} /> TOOL SUCCESS ≠ BUSINESS SUCCESS
          </div>
          Tool execution success alone never marks a case as resolved. Only OutcomeVerifier asserting PostgreSQL database state can declare business resolution.
        </div>
      </div>
    </div>
  );
};
