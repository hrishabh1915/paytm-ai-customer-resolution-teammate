import { z } from "zod";
import { ToolDefinition, ToolResult } from "../types";
import { prisma } from "../../config/db";
import { HumanReviewStatus } from "../../types";

export const requestHumanEscalationInputSchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId is required"),
  stepId: z.string().trim().min(1, "stepId is required"),
  reason: z.string().trim().min(1, "reason is required"),
  proposedTool: z.string().trim().min(1, "proposedTool is required"),
  proposedParams: z.record(z.string(), z.unknown()).default({}),
});

export type RequestHumanEscalationInput = z.infer<
  typeof requestHumanEscalationInputSchema
>;

export interface HumanEscalationResponseData {
  reviewId: string;
  sessionId: string;
  stepId: string;
  status: HumanReviewStatus;
  reason: string;
  proposedTool: string;
  createdAt: string;
}

export const requestHumanEscalationTool: ToolDefinition<
  RequestHumanEscalationInput,
  HumanEscalationResponseData
> = {
  name: "request_human_escalation",
  description:
    "Escalate a resolution session to a human supervisor for manual review and approval.",
  category: "HUMAN",
  schema: requestHumanEscalationInputSchema,
  execute: async (
    input: RequestHumanEscalationInput
  ): Promise<ToolResult<HumanEscalationResponseData>> => {
    // 1. Verify session exists
    const session = await prisma.resolutionSession.findUnique({
      where: { sessionId: input.sessionId },
    });

    if (!session) {
      return {
        success: false,
        toolName: "request_human_escalation",
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Resolution session '${input.sessionId}' was not found.`,
          retryable: false,
        },
      };
    }

    // 2. Verify step exists and belongs to session
    const step = await prisma.actionStep.findUnique({
      where: { stepId: input.stepId },
    });

    if (!step || step.sessionId !== input.sessionId) {
      return {
        success: false,
        toolName: "request_human_escalation",
        error: {
          code: "STEP_NOT_FOUND",
          message: `Action step '${input.stepId}' was not found or does not belong to session '${input.sessionId}'.`,
          retryable: false,
        },
      };
    }

    // 3. Create human review and update session state atomically
    const review = await prisma.$transaction(async (tx) => {
      const createdReview = await tx.humanReview.create({
        data: {
          sessionId: input.sessionId,
          stepId: input.stepId,
          reason: input.reason,
          proposedTool: input.proposedTool,
          proposedParams: input.proposedParams as any,
          status: HumanReviewStatus.PENDING,
        },
      });

      await tx.resolutionSession.update({
        where: { sessionId: input.sessionId },
        data: {
          currentState: "HUMAN_REVIEW",
        },
      });

      return createdReview;
    });

    return {
      success: true,
      toolName: "request_human_escalation",
      data: {
        reviewId: review.reviewId,
        sessionId: review.sessionId,
        stepId: review.stepId,
        status: review.status,
        reason: review.reason,
        proposedTool: review.proposedTool,
        createdAt: review.createdAt.toISOString(),
      },
    };
  },
};
