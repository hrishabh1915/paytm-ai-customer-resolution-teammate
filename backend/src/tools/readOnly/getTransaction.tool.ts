import { z } from "zod";
import { ToolDefinition, ToolResult } from "../types";
import { transactionService, SyntheticTransactionData } from "../../synthetic/transaction.service";

export const getTransactionInputSchema = z.object({
  transactionId: z.string().trim().min(1, "transactionId is required"),
});

export type GetTransactionInput = z.infer<typeof getTransactionInputSchema>;

export const getTransactionTool: ToolDefinition<GetTransactionInput, SyntheticTransactionData> = {
  name: "get_transaction",
  description: "Fetch status and details of a specific transaction by transactionId.",
  category: "READ_ONLY",
  schema: getTransactionInputSchema,
  execute: async (input: GetTransactionInput): Promise<ToolResult<SyntheticTransactionData>> => {
    const txn = await transactionService.getTransactionById(input.transactionId);

    if (!txn) {
      return {
        success: false,
        toolName: "get_transaction",
        error: {
          code: "TRANSACTION_NOT_FOUND",
          message: `Transaction with ID '${input.transactionId}' not found in synthetic store.`,
          retryable: false,
        },
      };
    }

    return {
      success: true,
      toolName: "get_transaction",
      data: txn,
    };
  },
};
