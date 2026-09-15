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

export type SessionOutcomeStatus =
  | "IN_PROGRESS"
  | "VERIFIED_SUCCESS"
  | "VERIFIED_FAILURE"
  | "ESCALATED";

export type PolicyVerdict = "ALLOWED" | "BLOCKED" | "REQUIRES_HUMAN";

export type ExecutionStatus = "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";

export type HumanReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "MODIFIED";

export type AuditStage =
  | "INTAKE"
  | "CONTEXT_GATHERED"
  | "PLAN_PROPOSED"
  | "POLICY_EVALUATED"
  | "TOOL_EXECUTED"
  | "HUMAN_DECIDED"
  | "OUTCOME_VERIFIED"
  | "STATE_TRANSITION";

export interface SyntheticCustomerData {
  name: string;
  phone: string;
  accountStatus: "ACTIVE" | "SUSPENDED" | "FROZEN";
  syntheticBalance: number;
}

export interface ActionStepData {
  stepId: string;
  sessionId: string;
  toolName: string;
  toolParams: Record<string, unknown>;
  policyVerdict: PolicyVerdict;
  policyRuleTriggered: string | null;
  executionStatus: ExecutionStatus;
  executionResult?: Record<string, unknown> | null;
  errorMessage?: string | null;
  executedAt?: string | null;
  createdAt: string;
}

export interface HumanReviewData {
  reviewId: string;
  sessionId: string;
  stepId: string;
  reason: string;
  proposedTool: string;
  proposedParams: Record<string, unknown>;
  status: HumanReviewStatus;
  reviewerNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface AuditLogEntryData {
  id: string;
  stage: AuditStage;
  decisionSummary?: string | null;
  contextReferences?: Record<string, unknown> | null;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface SessionStatusResponse {
  sessionId: string;
  customerId: string;
  targetTransactionId: string | null;
  targetTransaction?: {
    transactionId: string;
    amount: number;
    billerOrMerchant: string;
    status: string;
    failureReason: string | null;
  } | null;
  statedObjective: string;
  currentState: OrchestratorSessionState;
  retryCount: number;
  maxRetries: number;
  outcomeStatus: SessionOutcomeStatus;
  createdAt: string;
  updatedAt: string;
  customer: SyntheticCustomerData;
  actionSteps: ActionStepData[];
  humanReviews: HumanReviewData[];
  auditLogEntries: AuditLogEntryData[];
}

export interface StepExecutionResult {
  sessionId: string;
  previousState: string;
  currentState: OrchestratorSessionState;
  outcomeStatus: SessionOutcomeStatus;
  stepId?: string;
  toolName?: string;
  policyVerdict?: PolicyVerdict;
  policyRuleTriggered?: string | null;
  executionStatus?: ExecutionStatus;
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

export interface DemoScenario {
  id: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C";
  title: string;
  badge: string;
  description: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    status: string;
    balance: number;
  };
  transaction: {
    id: string;
    amount: number;
    biller: string;
    status: string;
    reason: string;
  };
  expectedFlow: string;
}

export interface SeedScenarioResponse {
  sessionId: string;
  scenario: string;
  scenarioMeta?: DemoScenario;
  customer: SyntheticCustomerData & { customerId: string };
  transaction: {
    transactionId: string;
    amount: number;
    billerOrMerchant: string;
    status: string;
    failureReason: string | null;
  };
  statedObjective: string;
}
