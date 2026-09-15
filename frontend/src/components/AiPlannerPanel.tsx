import React from "react";
import { Cpu, Info } from "lucide-react";
import type { SessionStatusResponse } from "../types/api";

interface AiPlannerPanelProps {
  session?: SessionStatusResponse | null;
}

export const AiPlannerPanel: React.FC<AiPlannerPanelProps> = ({ session }) => {
  // Find the latest proposed action or action step
  const actionSteps = session?.actionSteps || [];
  const latestStep = actionSteps[actionSteps.length - 1];
  const auditLogs = session?.auditLogEntries || [];
  const latestPlanLog = [...auditLogs]
    .reverse()
    .find((l) => l.stage === "PLAN_PROPOSED");

  const planDetails = latestPlanLog?.details as Record<string, unknown> | undefined;
  const toolName = latestStep?.toolName || (planDetails?.toolName as string) || "Pending Proposal";
  const decisionSummary = latestPlanLog?.decisionSummary || "Awaiting planner analysis cycle...";
  const expectedOutcome = (planDetails?.expectedOutcome as string) || "Pending plan formulation";
  const confidence = typeof planDetails?.confidence === "number" ? planDetails.confidence : 0.95;
  const hasPlan = Boolean(latestPlanLog || latestStep);
  const modelName = (planDetails?.model as string) || "";
  const isOfflineFallback = modelName.includes("offline-sim") || modelName.includes("mock");
  const modelBadge = isOfflineFallback
    ? "OFFLINE DEMO FALLBACK"
    : modelName
    ? `LIVE: ${modelName}`
    : "IDLE";

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <div className="panel-icon ai">
            <Cpu size={18} />
          </div>
          <div className="panel-title">AI Planner (Propose)</div>
        </div>
        <span
          className="panel-tag mono"
          style={{
            background: hasPlan
              ? isOfflineFallback
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(168, 85, 247, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            color: hasPlan
              ? isOfflineFallback
                ? "var(--accent-amber)"
                : "var(--accent-purple)"
              : "var(--text-muted)",
            fontSize: 10,
          }}
        >
          {modelBadge}
        </span>
      </div>

      <div className="panel-body">
        {/* Proposed Tool */}
        <div className="kv-item">
          <span className="kv-label">Proposed Action</span>
          <span className="kv-value mono highlight" style={{ color: "var(--accent-purple)" }}>
            {toolName}
          </span>
        </div>

        {/* Decision Summary */}
        <div className="kv-item">
          <span className="kv-label">Reasoning & Objective</span>
          <span className="kv-value">{decisionSummary}</span>
        </div>

        {/* Expected Outcome */}
        <div className="kv-item">
          <span className="kv-label">Expected Outcome</span>
          <span className="kv-value" style={{ color: "var(--text-secondary)" }}>
            {expectedOutcome}
          </span>
        </div>

        {/* Confidence (INFORMATIONAL ONLY) */}
        <div className="kv-item">
          <span className="kv-label">
            Model Confidence <span style={{ color: "var(--text-muted)", fontSize: 10 }}>(INFORMATIONAL ONLY)</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--bg-subtle)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${confidence * 100}%`,
                  height: "100%",
                  background: "var(--accent-purple)",
                  borderRadius: 3,
                }}
              />
            </div>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-purple)" }}>
              {(confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Authority Boundary Invariant Callout */}
        <div className="callout-box purple" style={{ marginTop: "auto" }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <Info size={13} /> AI DOES NOT EXECUTE ACTIONS
          </div>
          The LLM is a probabilistic reasoning planner only. It has zero direct tool access, zero database mutation rights, and cannot self-authorize execution.
        </div>
      </div>
    </div>
  );
};
