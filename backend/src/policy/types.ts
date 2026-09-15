import {
  CustomerAccountStatus,
  TransactionStatus,
  ActionExecutionStatus,
  ActionStepPolicyStatus,
  HumanReviewStatus,
} from "../types";

export type PolicyVerdict = "ALLOWED" | "BLOCKED" | "REQUIRES_HUMAN";

export interface ProposedAction {
  toolName: string;
  params: Record<string, unknown>;
  stepOrder?: number;
  expectedOutcome?: string;
}

export interface EvidenceReferences {
  sessionId: string;
  customerId?: string;
  transactionId?: string;
  stepId?: string;
  evaluatedAmount?: number;
  accountStatus?: string;
  attemptCount?: number;
  [key: string]: unknown;
}

export interface PolicyDecision {
  verdict: PolicyVerdict;
  toolName: string;
  ruleId: string;
  reason: string;
  evidenceReferences: EvidenceReferences;
  evaluatedAt: string;
}

export interface AuthoritativeSessionContext {
  sessionId: string;
  customerId: string;
  targetTransactionId: string | null;
  currentState: string;
  retryCount: number;
  maxRetries: number;
  outcomeStatus: string;
}

export interface AuthoritativeCustomerContext {
  customerId: string;
  name: string;
  phone: string;
  accountStatus: CustomerAccountStatus;
  syntheticBalance: number;
}

export interface AuthoritativeTransactionContext {
  transactionId: string;
  customerId: string;
  amount: number;
  billerOrMerchant: string;
  status: TransactionStatus;
  failureReason: string | null;
  idempotencyKey: string | null;
}

export interface AuthoritativeActionStepContext {
  stepId: string;
  sessionId: string;
  toolName: string;
  toolParams: unknown;
  policyVerdict: ActionStepPolicyStatus;
  executionStatus: ActionExecutionStatus;
  executionResult?: unknown;
}

export interface AuthoritativeHumanReviewContext {
  reviewId: string;
  sessionId: string;
  stepId: string;
  status: HumanReviewStatus;
}

export interface PolicyEvaluationContext {
  sessionId: string;
  action: ProposedAction;
  session: AuthoritativeSessionContext;
  customer?: AuthoritativeCustomerContext | null;
  transaction?: AuthoritativeTransactionContext | null;
  actionStepsInSession?: AuthoritativeActionStepContext[];
  pendingReviewsInSession?: AuthoritativeHumanReviewContext[];
}

export type PolicyRule = (
  context: PolicyEvaluationContext,
  config: import("./policyConfig").PolicyConfig
) => PolicyDecision | null;
