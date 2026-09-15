import { z } from "zod";
import { ToolDefinition, ToolResult } from "../types";
import {
  transactionService,
  RetryPaymentInput,
  RetryPaymentSuccessData,
} from "../../synthetic/transaction.service";

export const retryPaymentInputSchema = z.object({
  originalTransactionId: z.string().trim().min(1, "originalTransactionId is required"),
  idempotencyKey: z.string().trim().min(1, "idempotencyKey is required"),
});

export const retryPaymentTool: ToolDefinition<RetryPaymentInput, RetryPaymentSuccessData> = {
  name: "retry_payment",
  description:
    "Retry a failed transaction against the synthetic payment gateway. Derives amount, customer, and biller authoritatively.",
  category: "MUTATING",
  schema: retryPaymentInputSchema,
  execute: async (input: RetryPaymentInput): Promise<ToolResult<RetryPaymentSuccessData>> => {
    return transactionService.retryPayment(input);
  },
};
