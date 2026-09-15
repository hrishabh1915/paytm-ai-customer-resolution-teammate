import React from "react";
import { History } from "lucide-react";
import type { AuditLogEntryData, AuditStage } from "../types/api";

interface AuditTimelineProps {
  logs: AuditLogEntryData[];
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ logs = [] }) => {
  const getStageBadge = (stage: AuditStage) => {
    switch (stage) {
      case "INTAKE":
        return { label: "INTAKE", bg: "rgba(56, 189, 248, 0.15)", color: "var(--accent-blue)" };
      case "CONTEXT_GATHERED":
        return { label: "CONTEXT", bg: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)" };
      case "PLAN_PROPOSED":
        return { label: "AI_PLAN", bg: "rgba(168, 85, 247, 0.15)", color: "var(--accent-purple)" };
      case "POLICY_EVALUATED":
        return { label: "POLICY_GATE", bg: "rgba(245, 158, 11, 0.15)", color: "var(--accent-amber)" };
      case "TOOL_EXECUTED":
        return { label: "TOOL_EXEC", bg: "rgba(0, 186, 242, 0.15)", color: "var(--paytm-cyan)" };
      case "HUMAN_DECIDED":
        return { label: "HUMAN_REVIEW", bg: "rgba(245, 158, 11, 0.2)", color: "var(--accent-amber)" };
      case "OUTCOME_VERIFIED":
        return { label: "OUTCOME_VERIFIED", bg: "rgba(16, 185, 129, 0.15)", color: "var(--accent-green)" };
      case "STATE_TRANSITION":
        return { label: "STATE_CHANGE", bg: "rgba(255, 255, 255, 0.08)", color: "var(--text-secondary)" };
      default:
        return { label: stage, bg: "rgba(255, 255, 255, 0.05)", color: "var(--text-muted)" };
    }
  };

  return (
    <div className="audit-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <div className="panel-icon case" style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--text-primary)" }}>
            <History size={18} />
          </div>
          <div>
            <div className="panel-title">Live Immutable Audit Timeline</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Structured, fact-based trace persisted to PostgreSQL audit_log_entries (No private CoT)
            </div>
          </div>
        </div>
        <span className="panel-tag mono" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)" }}>
          {logs.length} Events Logged
        </span>
      </div>

      <div className="audit-table-wrapper">
        <table className="audit-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Timestamp</th>
              <th style={{ width: 140 }}>Stage</th>
              <th>Decision Summary / Structured Facts</th>
              <th style={{ width: 180 }}>References</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                  No audit events logged yet. Seed or run a case above.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const badge = getStageBadge(log.stage);
                const timeStr = new Date(log.timestamp).toLocaleTimeString();
                const refs = log.contextReferences ? Object.entries(log.contextReferences) : [];

                return (
                  <tr key={log.id}>
                    <td className="mono" style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      {timeStr}
                    </td>
                    <td>
                      <span className="stage-badge mono" style={{ background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                      {log.decisionSummary || JSON.stringify(log.details)}
                    </td>
                    <td>
                      {refs.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {refs.map(([k, v]) => (
                            <span
                              key={k}
                              className="mono"
                              style={{
                                fontSize: 10,
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid var(--border-color)",
                                padding: "2px 6px",
                                borderRadius: 3,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
