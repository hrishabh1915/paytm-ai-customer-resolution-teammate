import {
  ActionExecutionStatus,
  ActionStepPolicyStatus,
  HumanReviewStatus,
  SessionOutcomeStatus,
} from "../types";

export type OrchestratorSessionState =
  | "INIT"
  | "GATHERING_CONTEXT"
  | "FORMULATING_PLAN"
  | "EVALUATING_POLICY"
  | "EXECUTING_STEP"
  | "OBSERVING_STEP"
  | "VERIFYING_OUTCOME"
  | "HUMAN_REVIEW"
  | "RESOLVED_SUCCESS"
  | "RESOLVED_FAILURE"
  | "ESCALATED";

export interface StepExecutionResult {
  sessionId: string;
  previousState: string;
  currentState: OrchestratorSessionState;
  outcomeStatus: SessionOutcomeStatus;
  stepId?: string;
  toolName?: string;
  policyVerdict?: ActionStepPolicyStatus;
  policyRuleTriggered?: string | null;
  executionStatus?: ActionExecutionStatus;
  executionResult?: unknown;
  humanReviewId?: string;
  message: string;
  isTerminal: boolean;
}

export interface RunSessionResult {
  sessionId: string;
  finalState: OrchestratorSessionState;
  finalOutcomeStatus: SessionOutcomeStatus;
  stepsExecuted: number;
  history: StepExecutionResult[];
  message: string;
}

export interface HumanVerdictInput {
  verdict: "APPROVED" | "REJECTED" | "MODIFIED";
  reviewerNotes?: string;
  modifiedParams?: Record<string, unknown>;
}
