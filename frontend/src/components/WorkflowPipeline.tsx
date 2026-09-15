import React from "react";
import {
  CheckCircle2,
  Clock,
  Cpu,
  ShieldCheck,
  Zap,
  FileCheck,
  UserCheck,
} from "lucide-react";
import type { OrchestratorSessionState } from "../types/api";

interface WorkflowPipelineProps {
  currentState?: OrchestratorSessionState;
  outcomeStatus?: string;
}

interface PipelineStage {
  id: string;
  label: string;
  icon: React.ReactNode;
  activeIn: OrchestratorSessionState[];
  completedIn: OrchestratorSessionState[];
}

export const WorkflowPipeline: React.FC<WorkflowPipelineProps> = ({
  currentState = "INIT",
}) => {
  const stages: PipelineStage[] = [
    {
      id: "intake",
      label: "Customer Intake",
      icon: <Clock size={15} />,
      activeIn: ["INIT"],
      completedIn: [
        "GATHERING_CONTEXT",
        "FORMULATING_PLAN",
        "EVALUATING_POLICY",
        "EXECUTING_STEP",
        "OBSERVING_STEP",
        "VERIFYING_OUTCOME",
        "HUMAN_REVIEW",
        "RESOLVED_SUCCESS",
        "RESOLVED_FAILURE",
        "ESCALATED",
      ],
    },
    {
      id: "context",
      label: "Context Gathering",
      icon: <FileCheck size={15} />,
      activeIn: ["GATHERING_CONTEXT"],
      completedIn: [
        "FORMULATING_PLAN",
        "EVALUATING_POLICY",
        "EXECUTING_STEP",
        "OBSERVING_STEP",
        "VERIFYING_OUTCOME",
        "HUMAN_REVIEW",
        "RESOLVED_SUCCESS",
        "RESOLVED_FAILURE",
        "ESCALATED",
      ],
    },
    {
      id: "plan",
      label: "AI Plan (Propose)",
      icon: <Cpu size={15} />,
      activeIn: ["FORMULATING_PLAN"],
      completedIn: [
        "EVALUATING_POLICY",
        "EXECUTING_STEP",
        "OBSERVING_STEP",
        "VERIFYING_OUTCOME",
        "HUMAN_REVIEW",
        "RESOLVED_SUCCESS",
        "RESOLVED_FAILURE",
        "ESCALATED",
      ],
    },
    {
      id: "policy",
      label: "Policy Engine Gate",
      icon: <ShieldCheck size={15} />,
      activeIn: ["EVALUATING_POLICY"],
      completedIn: [
        "EXECUTING_STEP",
        "OBSERVING_STEP",
        "VERIFYING_OUTCOME",
        "HUMAN_REVIEW",
        "RESOLVED_SUCCESS",
        "RESOLVED_FAILURE",
        "ESCALATED",
      ],
    },
    {
      id: "action",
      label: "Tool Execution",
      icon: <Zap size={15} />,
      activeIn: ["EXECUTING_STEP", "OBSERVING_STEP"],
      completedIn: [
        "VERIFYING_OUTCOME",
        "HUMAN_REVIEW",
        "RESOLVED_SUCCESS",
        "RESOLVED_FAILURE",
        "ESCALATED",
      ],
    },
    {
      id: "outcome",
      label: "Outcome Verifier",
      icon: <CheckCircle2 size={15} />,
      activeIn: ["VERIFYING_OUTCOME"],
      completedIn: ["RESOLVED_SUCCESS", "RESOLVED_FAILURE", "ESCALATED"],
    },
    {
      id: "final",
      label: "Final Resolution",
      icon: <UserCheck size={15} />,
      activeIn: ["RESOLVED_SUCCESS", "RESOLVED_FAILURE", "ESCALATED", "HUMAN_REVIEW"],
      completedIn: ["RESOLVED_SUCCESS", "RESOLVED_FAILURE", "ESCALATED"],
    },
  ];

  return (
    <div className="pipeline-card">
      <div className="pipeline-steps">
        {stages.map((st, idx) => {
          let statusClass = "pending";
          let statusLabel = "Pending";
          let iconColor = "var(--text-muted)";

          if (st.completedIn.includes(currentState)) {
            statusClass = "completed";
            statusLabel = "Completed";
            iconColor = "var(--accent-green)";
          }

          if (st.activeIn.includes(currentState)) {
            if (currentState === "HUMAN_REVIEW") {
              statusClass = "review";
              statusLabel = "Waiting Human Review";
              iconColor = "var(--accent-amber)";
            } else if (currentState === "RESOLVED_FAILURE") {
              statusClass = "blocked";
              statusLabel = "Resolved Failure";
              iconColor = "var(--accent-red)";
            } else if (currentState === "ESCALATED") {
              statusClass = "blocked";
              statusLabel = "Escalated";
              iconColor = "var(--accent-red)";
            } else if (currentState === "RESOLVED_SUCCESS") {
              statusClass = "completed";
              statusLabel = "Verified Success";
              iconColor = "var(--accent-green)";
            } else {
              statusClass = "active";
              statusLabel = "In Progress";
              iconColor = "var(--paytm-cyan)";
            }
          }

          return (
            <div key={st.id} className={`pipeline-node ${statusClass}`}>
              <div className="node-header">
                <span className="node-step-num">Step 0{idx + 1}</span>
                <span style={{ color: iconColor }}>{st.icon}</span>
              </div>
              <div className="node-title">{st.label}</div>
              <div className="node-status" style={{ color: iconColor }}>
                {statusLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
