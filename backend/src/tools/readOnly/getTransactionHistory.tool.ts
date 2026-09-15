import { z } from "zod";
import { ToolDefinition, ToolResult } from "../types";
import { transactionService, SyntheticTransactionData } from "../../synthetic/transaction.service";

export const getTransactionHistoryInputSchema = z.object({
  customerId: z.string().trim().min(1, "customerId is required"),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

export type GetTransactionHistoryInput = z.infer<typeof getTransactionHistoryInputSchema>;

export interface TransactionHistoryData {
  customerId: string;
  count: number;
  transactions: SyntheticTransactionData[];
}

export const getTransactionHistoryTool: ToolDefinition<
  GetTransactionHistoryInput,
  TransactionHistoryData
> = {
  name: "get_transaction_history",
  description: "Fetch recent transaction history for a customer.",
  category: "READ_ONLY",
  schema: getTransactionHistoryInputSchema,
  execute: async (
    input: GetTransactionHistoryInput
  ): Promise<ToolResult<TransactionHistoryData>> => {
    const transactions = await transactionService.getTransactionHistory(
      input.customerId,
      input.limit || 5
    );

    return {
      success: true,
      toolName: "get_transaction_history",
      data: {
        customerId: input.customerId,
        count: transactions.length,
        transactions,
      },
    };
  },
};
