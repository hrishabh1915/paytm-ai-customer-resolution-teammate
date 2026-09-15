import React, { useState } from "react";
import { AlertTriangle, Check, X, Edit3, ShieldCheck } from "lucide-react";
import type { HumanReviewData } from "../types/api";

interface HumanReviewModalProps {
  pendingReview?: HumanReviewData | null;
  onSubmitVerdict: (
    reviewId: string,
    verdict: "APPROVED" | "REJECTED" | "MODIFIED",
    notes?: string,
    modifiedParams?: Record<string, unknown>
  ) => void;
  isSubmitting: boolean;
}

export const HumanReviewModal: React.FC<HumanReviewModalProps> = ({
  pendingReview,
  onSubmitVerdict,
  isSubmitting,
}) => {
  const [notes, setNotes] = useState("");
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedTxnId, setModifiedTxnId] = useState(
    (pendingReview?.proposedParams?.originalTransactionId as string) || ""
  );

  if (!pendingReview) {
    return null;
  }

  const handleApprove = () => {
    onSubmitVerdict(
      pendingReview.reviewId,
      "APPROVED",
      notes || "Supervisor approved after reviewing customer transaction history."
    );
  };

  const handleReject = () => {
    onSubmitVerdict(
      pendingReview.reviewId,
      "REJECTED",
      notes || "Supervisor rejected proposed action due to risk evaluation."
    );
  };

  const handleModify = () => {
    onSubmitVerdict(
      pendingReview.reviewId,
      "MODIFIED",
      notes || "Supervisor modified transaction parameters before execution.",
      {
        originalTransactionId: modifiedTxnId,
      }
    );
  };

  return (
    <div className="human-review-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              background: "rgba(245, 158, 11, 0.2)",
              color: "var(--accent-amber)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent-amber)" }}>
              HUMAN SUPERVISOR REVIEW REQUIRED
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Policy Engine paused autonomous execution: {pendingReview.reason}
            </div>
          </div>
        </div>

        <span className="panel-tag" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--accent-amber)" }}>
          Pending Decision
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          background: "rgba(0,0,0,0.3)",
          padding: 14,
          borderRadius: "var(--radius-md)",
        }}
      >
        <div className="kv-item">
          <span className="kv-label">Proposed Action</span>
          <span className="kv-value mono" style={{ color: "var(--paytm-cyan)" }}>
            {pendingReview.proposedTool}
          </span>
        </div>
        <div className="kv-item">
          <span className="kv-label">Review Reason</span>
          <span className="kv-value">{pendingReview.reason}</span>
        </div>
        <div className="kv-item">
          <span className="kv-label">Review ID</span>
          <span className="kv-value mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {pendingReview.reviewId}
          </span>
        </div>
      </div>

      {isModifying ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "rgba(0,0,0,0.2)", padding: 12, borderRadius: "var(--radius-md)" }}>
          <div className="kv-label">Modify Parameters:</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 150 }}>
              Original Transaction ID:
            </label>
            <input
              type="text"
              value={modifiedTxnId}
              onChange={(e) => setModifiedTxnId(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                color: "#fff",
                fontFamily: "monospace",
              }}
            />
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="kv-label">Supervisor Reviewer Notes (Recorded in Immutable Audit Trail):</span>
        <input
          type="text"
          placeholder="Enter reason or verification notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-color)",
            background: "var(--bg-card)",
            color: "#fff",
            fontSize: 13,
          }}
        />
      </div>

      <div className="hr-actions">
        {isModifying ? (
          <button className="btn-approve" onClick={handleModify} disabled={isSubmitting}>
            <Check size={15} /> Submit Modified Action to Policy Engine
          </button>
        ) : (
          <button className="btn-approve" onClick={handleApprove} disabled={isSubmitting}>
            <Check size={15} /> Approve Action
          </button>
        )}

        <button
          className="btn-modify"
          onClick={() => setIsModifying(!isModifying)}
          disabled={isSubmitting}
        >
          <Edit3 size={15} /> {isModifying ? "Cancel Modification" : "Modify Action"}
        </button>

        <button className="btn-reject" onClick={handleReject} disabled={isSubmitting}>
          <X size={15} /> Reject Action (Terminate Case)
        </button>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <ShieldCheck size={13} color="var(--accent-amber)" />
        Supervisor-authorized actions must freshly re-enter Policy Engine evaluation before execution is permitted.
      </div>
    </div>
  );
};
