import React from "react";
import {
  Play,
  StepForward,
  RotateCw,
  Sparkles,
  ShieldCheck,
  Cpu,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import type { DemoScenario, OrchestratorSessionState } from "../types/api";

interface HeaderProps {
  sessionId?: string;
  statedObjective?: string;
  currentState?: OrchestratorSessionState;
  scenarios: DemoScenario[];
  activeScenarioId?: string;
  onSelectScenario: (scenarioId: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C") => void;
  onRunWorkflow: () => void;
  onStepWorkflow: () => void;
  onRefresh: () => void;
  isRunning: boolean;
  isStepping: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sessionId,
  statedObjective,
  currentState,
  scenarios,
  activeScenarioId,
  onSelectScenario,
  onRunWorkflow,
  onStepWorkflow,
  onRefresh,
  isRunning,
  isStepping,
}) => {
  const isTerminal =
    currentState === "RESOLVED_SUCCESS" ||
    currentState === "RESOLVED_FAILURE" ||
    currentState === "ESCALATED";

  return (
    <header className="cr-header">
      {/* Top row: Brand & Status & Thesis */}
      <div className="cr-header-top">
        <div className="cr-brand">
          <div className="cr-brand-logo">₹</div>
          <div>
            <div className="cr-brand-title">
              AI Customer Resolution Teammate
              <span className="status-pill operational">
                <span className="status-dot"></span>
                Operational Engine
              </span>
            </div>
            <div className="cr-brand-subtitle">
              An outcome-driven AI teammate for autonomous customer dispute resolution
            </div>
          </div>
        </div>

        {/* 4-Step Core Architectural Thesis */}
        <div className="cr-thesis-banner">
          <span className="thesis-step ai">
            <Cpu size={14} /> AI Proposes
          </span>
          <ArrowRight className="thesis-arrow" size={13} />
          <span className="thesis-step policy">
            <ShieldCheck size={14} /> Policy Decides
          </span>
          <ArrowRight className="thesis-arrow" size={13} />
          <span className="thesis-step system">
            <Sparkles size={14} /> System Acts
          </span>
          <ArrowRight className="thesis-arrow" size={13} />
          <span className="thesis-step outcome">
            <CheckCircle size={14} /> Outcome Verifies
          </span>
        </div>

        {/* Demo Disclaimer & Active Session */}
        <div className="cr-badges">
          <span className="status-pill synthetic">
            <AlertCircle size={13} />
            SYNTHETIC DEMO DATA
          </span>
          {sessionId && (
            <span className="status-pill mono">
              Session: <strong style={{ color: "var(--paytm-cyan)", marginLeft: 4 }}>{sessionId.slice(0, 8)}...</strong>
            </span>
          )}
        </div>
      </div>

      {/* Objective and Status summary if available */}
      {statedObjective && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", fontSize: 10 }}>Active Goal:</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{statedObjective}</span>
        </div>
      )}

      {/* Controls row: Scenarios & Action Buttons */}
      <div className="cr-controls-bar">
        {/* Scenario Selector */}
        <div className="scenario-selector-group">
          <span className="scenario-label">Judge Demo Scenarios:</span>
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              className={`scenario-btn ${activeScenarioId === sc.id ? "active" : ""}`}
              onClick={() => onSelectScenario(sc.id)}
              title={sc.description}
            >
              {sc.title}
            </button>
          ))}
        </div>

        {/* Execution Control Buttons */}
        <div className="action-buttons-group">
          <button
            className="btn-secondary"
            onClick={onRefresh}
            disabled={isRunning || isStepping}
            title="Refresh current session state from backend"
          >
            <RotateCw size={15} />
            Refresh
          </button>

          <button
            className="btn-secondary"
            onClick={onStepWorkflow}
            disabled={isRunning || isStepping || isTerminal || !sessionId}
            title="Execute exactly ONE autonomous step cycle"
          >
            <StepForward size={15} />
            {isStepping ? "Stepping..." : "Step Workflow (1 Step)"}
          </button>

          <button
            className="btn-primary"
            onClick={onRunWorkflow}
            disabled={isRunning || isStepping || isTerminal || !sessionId}
            title="Run autonomous resolution workflow until completion or human review"
          >
            <Play size={15} />
            {isRunning ? "Running Engine..." : "Run Workflow"}
          </button>
        </div>
      </div>
    </header>
  );
};
