import { z } from "zod";

export const intakeSchema = z.object({
  customerId: z.string().trim().min(1, "customerId is required"),
  transactionId: z.string().trim().min(1, "transactionId is required"),
  statedObjective: z.string().trim().min(1, "statedObjective is required and cannot be empty"),
});

export type IntakeInput = z.infer<typeof intakeSchema>;

export interface IntakeResponse {
  sessionId: string;
  currentState: string;
  outcomeStatus: string;
}
