import React from "react";
import type { SessionStatusResponse } from "../types/api";

interface MetricsStripProps {
  session?: SessionStatusResponse | null;
}

export const MetricsStrip: React.FC<MetricsStripProps> = ({ session }) => {
  const actionSteps = session?.actionSteps || [];
  const proposedCount = actionSteps.length;
  const blockedCount = actionSteps.filter((s) => s.policyVerdict === "BLOCKED").length;
  const reviewCount = session?.humanReviews?.length || 0;
  const outcomeStatus = session?.outcomeStatus || "IN_PROGRESS";

  const simulatedAmountRecovered =
    outcomeStatus === "VERIFIED_SUCCESS" && session?.targetTransaction?.amount
      ? session.targetTransaction.amount
      : 0;

  return (
    <div className="metrics-strip">
      <div className="metric-card">
        <span className="metric-label">Actions Proposed</span>
        <span className="metric-value" style={{ color: "var(--accent-purple)" }}>
          {proposedCount}
        </span>
        <span className="metric-sub">By AI reasoning planner</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Policy Authorized</span>
        <span className="metric-value" style={{ color: "var(--paytm-cyan)" }}>
          {actionSteps.filter((s) => s.policyVerdict === "ALLOWED").length}
        </span>
        <span className="metric-sub">Passed deterministic guardrails</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Actions Blocked</span>
        <span className="metric-value" style={{ color: blockedCount > 0 ? "var(--accent-red)" : "var(--text-muted)" }}>
          {blockedCount}
        </span>
        <span className="metric-sub">Prevented by safety rules</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Human Reviews</span>
        <span className="metric-value" style={{ color: reviewCount > 0 ? "var(--accent-amber)" : "var(--text-muted)" }}>
          {reviewCount}
        </span>
        <span className="metric-sub">Supervisor intervention points</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Outcome Verification</span>
        <span
          className="metric-value"
          style={{
            fontSize: 16,
            color:
              outcomeStatus === "VERIFIED_SUCCESS"
                ? "var(--accent-green)"
                : outcomeStatus === "VERIFIED_FAILURE"
                ? "var(--accent-red)"
                : "var(--text-secondary)",
          }}
        >
          {outcomeStatus}
        </span>
        <span className="metric-sub">PostgreSQL ground truth</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Simulated Amount Recovered</span>
        <span className="metric-value" style={{ color: simulatedAmountRecovered > 0 ? "var(--accent-green)" : "var(--text-muted)" }}>
          ₹{simulatedAmountRecovered.toLocaleString("en-IN")}
        </span>
        <span className="metric-sub mono" style={{ color: "var(--accent-amber)", fontSize: 10 }}>
          SYNTHETIC DEMO DATA
        </span>
      </div>
    </div>
  );
};
