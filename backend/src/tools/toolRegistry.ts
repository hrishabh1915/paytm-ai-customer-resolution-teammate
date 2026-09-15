import { ToolDefinition, ToolResult } from "./types";
import { getCustomerTool } from "./readOnly/getCustomer.tool";
import { getTransactionTool } from "./readOnly/getTransaction.tool";
import { getTransactionHistoryTool } from "./readOnly/getTransactionHistory.tool";
import { retryPaymentTool } from "./mutating/retryPayment.tool";
import { sendCustomerNotificationTool } from "./mutating/sendCustomerNotification.tool";
import { createSupportTicketTool } from "./mutating/createSupportTicket.tool";
import { requestHumanEscalationTool } from "./human/requestHumanEscalation.tool";

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.register(getCustomerTool);
    this.register(getTransactionTool);
    this.register(getTransactionHistoryTool);
    this.register(retryPaymentTool);
    this.register(sendCustomerNotificationTool);
    this.register(createSupportTicketTool);
    this.register(requestHumanEscalationTool);
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Safe execution entry point validating tool existence and Zod input schema.
   */
  async executeTool(name: string, rawInput: unknown): Promise<ToolResult> {
    const tool = this.getTool(name);

    if (!tool) {
      return {
        success: false,
        toolName: name,
        error: {
          code: "UNAUTHORIZED_TOOL",
          message: `Tool '${name}' is not recognized in the tool registry.`,
          retryable: false,
        },
      };
    }

    // Validate raw input schema
    const parseResult = tool.schema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        toolName: name,
        error: {
          code: "INVALID_TOOL_INPUT",
          message: `Invalid input for tool '${name}': ${parseResult.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
          retryable: false,
        },
      };
    }

    try {
      return await tool.execute(parseResult.data);
    } catch (error: any) {
      return {
        success: false,
        toolName: name,
        error: {
          code: "INTERNAL_TOOL_ERROR",
          message: error.message || "An unexpected error occurred during tool execution.",
          retryable: false,
        },
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();
