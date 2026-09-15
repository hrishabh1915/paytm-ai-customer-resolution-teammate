import { z } from "zod";

export const proposedActionSchema = z.object({
  toolName: z.string().trim().min(1, "toolName is required"),
  params: z.record(z.string(), z.unknown()).default({}),
});

export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const plannerOutputSchema = z.object({
  decisionSummary: z
    .string()
    .trim()
    .min(1, "decisionSummary must not be empty")
    .max(500, "decisionSummary must be concise (max 500 chars)"),
  proposedAction: proposedActionSchema,
  expectedOutcome: z
    .string()
    .trim()
    .min(1, "expectedOutcome must not be empty")
    .max(500, "expectedOutcome must be concise (max 500 chars)"),
  confidence: z
    .number()
    .min(0, "confidence must be >= 0")
    .max(1, "confidence must be <= 1")
    .default(1.0),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export interface ExecutionTraceItem {
  stepOrder: number;
  toolName: string;
  policyVerdict: "ALLOWED" | "BLOCKED" | "REQUIRES_HUMAN";
  executionStatus: "SUCCESS" | "FAILED" | "SKIPPED";
  observation?: Record<string, unknown>;
  errorMessage?: string;
}

export interface AuthoritativePlannerContext {
  customer: {
    customerId: string;
    name: string;
    accountStatus: string;
    syntheticBalance: number;
  };
  targetTransaction: {
    transactionId: string;
    amount: number;
    billerOrMerchant: string;
    status: string;
    failureReason: string | null;
    createdAt: string;
  } | null;
  recentTransactions: {
    transactionId: string;
    amount: number;
    billerOrMerchant: string;
    status: string;
    createdAt: string;
  }[];
}

export interface PlannerInput {
  sessionId: string;
  statedObjective: string; // Untrusted customer text describing the issue
  authoritativeContext: AuthoritativePlannerContext;
  executionTrace?: ExecutionTraceItem[];
}

export interface PlannerSuccess {
  success: true;
  output: PlannerOutput;
  model: string;
  latencyMs: number;
}

export interface PlannerFailure {
  success: false;
  errorCode:
    | "MISSING_API_KEY"
    | "ADAPTER_TIMEOUT"
    | "ADAPTER_NETWORK_ERROR"
    | "MALFORMED_JSON"
    | "SCHEMA_VALIDATION_ERROR"
    | "UNKNOWN_TOOL"
    | "INVALID_TOOL_PARAMETERS"
    | "INTERNAL_PLANNER_ERROR";
  message: string;
  rawOutput?: string;
}

export type PlannerResult = PlannerSuccess | PlannerFailure;
