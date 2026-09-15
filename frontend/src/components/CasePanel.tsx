import React from "react";
import { User, AlertCircle } from "lucide-react";
import type { SessionStatusResponse } from "../types/api";

interface CasePanelProps {
  session?: SessionStatusResponse | null;
}

export const CasePanel: React.FC<CasePanelProps> = ({ session }) => {
  if (!session) {
    return (
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <div className="panel-icon case">
              <User size={18} />
            </div>
            <div className="panel-title">Case & Customer Context</div>
          </div>
          <span className="panel-tag" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
            Awaiting Case
          </span>
        </div>
        <div className="panel-body">
          <div className="callout-box cyan">
            Select a demo scenario above to load synthetic customer & transaction context into the engine.
          </div>
        </div>
      </div>
    );
  }

  const { customer, statedObjective, targetTransactionId } = session;
  const isFrozen = customer.accountStatus === "FROZEN";

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <div className="panel-icon case">
            <User size={18} />
          </div>
          <div className="panel-title">Case Context</div>
        </div>
        <span
          className="panel-tag"
          style={{
            background: isFrozen ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            color: isFrozen ? "var(--accent-red)" : "var(--accent-green)",
          }}
        >
          {customer.accountStatus}
        </span>
      </div>

      <div className="panel-body">
        {/* Customer Information */}
        <div className="kv-item">
          <span className="kv-label">Customer Name</span>
          <span className="kv-value">{customer.name}</span>
        </div>

        <div className="kv-item">
          <span className="kv-label">Phone & Wallet</span>
          <span className="kv-value mono">
            {customer.phone} · ₹{customer.syntheticBalance.toLocaleString("en-IN")}
          </span>
        </div>

        {/* Transaction Information */}
        <div className="kv-item" style={{ marginTop: 4 }}>
          <span className="kv-label">Target Transaction</span>
          <span className="kv-value mono" style={{ color: "var(--paytm-cyan)" }}>
            {targetTransactionId || "No target transaction"}
          </span>
        </div>

        {session.targetTransaction && (
          <div className="kv-item">
            <span className="kv-label">Biller & Amount</span>
            <span className="kv-value">
              {session.targetTransaction.billerOrMerchant} (₹{session.targetTransaction.amount.toLocaleString("en-IN")}) ·{" "}
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: session.targetTransaction.status === "SUCCESS" ? "var(--accent-green)" : "var(--accent-red)",
                }}
              >
                {session.targetTransaction.status}
              </span>
            </span>
          </div>
        )}

        {/* Stated Objective */}
        <div className="kv-item">
          <span className="kv-label">Stated Objective</span>
          <span className="kv-value">{statedObjective}</span>
        </div>

        {/* Disclaimer Tag */}
        <div className="callout-box amber" style={{ marginTop: "auto" }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <AlertCircle size={13} /> SYNTHETIC DEMO DATA
          </div>
          All customer, wallet, and transaction data are mock entities in PostgreSQL synthetic tables.
        </div>
      </div>
    </div>
  );
};
