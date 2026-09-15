import { z } from "zod";
import { ToolDefinition, ToolResult } from "../types";
import { customerService, SyntheticCustomerData } from "../../synthetic/customer.service";

export const getCustomerInputSchema = z.object({
  customerId: z.string().trim().min(1, "customerId is required"),
});

export type GetCustomerInput = z.infer<typeof getCustomerInputSchema>;

export const getCustomerTool: ToolDefinition<GetCustomerInput, SyntheticCustomerData> = {
  name: "get_customer",
  description: "Fetch customer profile and account standing from synthetic customer store.",
  category: "READ_ONLY",
  schema: getCustomerInputSchema,
  execute: async (input: GetCustomerInput): Promise<ToolResult<SyntheticCustomerData>> => {
    const customer = await customerService.getCustomerById(input.customerId);

    if (!customer) {
      return {
        success: false,
        toolName: "get_customer",
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: `Customer with ID '${input.customerId}' not found in synthetic store.`,
          retryable: false,
        },
      };
    }

    return {
      success: true,
      toolName: "get_customer",
      data: customer,
    };
  },
};
