import { z } from "zod";
import { ToolDefinition, ToolResult } from "../types";
import { customerService } from "../../synthetic/customer.service";
import {
  mockNotificationService,
  NotificationResponse,
} from "../../synthetic/mockNotificationService";

export const sendCustomerNotificationInputSchema = z.object({
  customerId: z.string().trim().min(1, "customerId is required"),
  message: z.string().trim().min(1, "message is required"),
  channel: z.enum(["SMS", "IN_APP"]).default("IN_APP"),
});

export type SendCustomerNotificationInput = z.infer<
  typeof sendCustomerNotificationInputSchema
>;

export const sendCustomerNotificationTool: ToolDefinition<
  SendCustomerNotificationInput,
  NotificationResponse
> = {
  name: "send_customer_notification",
  description: "Send an update or resolution notification to a customer via SMS or In-App message.",
  category: "MUTATING",
  schema: sendCustomerNotificationInputSchema,
  execute: async (
    input: SendCustomerNotificationInput
  ): Promise<ToolResult<NotificationResponse>> => {
    const customer = await customerService.getCustomerById(input.customerId);

    if (!customer) {
      return {
        success: false,
        toolName: "send_customer_notification",
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: `Cannot send notification. Customer '${input.customerId}' was not found.`,
          retryable: false,
        },
      };
    }

    const delivery = await mockNotificationService.sendNotification({
      customerId: input.customerId,
      recipientPhone: customer.phone,
      message: input.message,
      channel: input.channel,
    });

    return {
      success: true,
      toolName: "send_customer_notification",
      data: delivery,
    };
  },
};
