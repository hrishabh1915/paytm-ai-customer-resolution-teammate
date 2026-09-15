import { z } from "zod";
import { ToolDefinition, ToolResult } from "../types";
import { customerService } from "../../synthetic/customer.service";
import {
  mockSupportService,
  SupportTicketResponse,
} from "../../synthetic/mockSupportService";

export const createSupportTicketInputSchema = z.object({
  customerId: z.string().trim().min(1, "customerId is required"),
  issueCategory: z
    .enum(["PAYMENT_FAILURE", "BILLER_DELAY", "REFUND_QUERY"])
    .default("PAYMENT_FAILURE"),
  summary: z.string().trim().min(1, "summary is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketInputSchema>;

export const createSupportTicketTool: ToolDefinition<
  CreateSupportTicketInput,
  SupportTicketResponse
> = {
  name: "create_support_ticket",
  description: "Create an internal support ticket for manual team follow-up.",
  category: "MUTATING",
  schema: createSupportTicketInputSchema,
  execute: async (
    input: CreateSupportTicketInput
  ): Promise<ToolResult<SupportTicketResponse>> => {
    const customer = await customerService.getCustomerById(input.customerId);

    if (!customer) {
      return {
        success: false,
        toolName: "create_support_ticket",
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: `Cannot create support ticket. Customer '${input.customerId}' was not found.`,
          retryable: false,
        },
      };
    }

    const ticket = await mockSupportService.createTicket({
      customerId: input.customerId,
      issueCategory: input.issueCategory,
      summary: input.summary,
      priority: input.priority,
    });

    return {
      success: true,
      toolName: "create_support_ticket",
      data: ticket,
    };
  },
};
