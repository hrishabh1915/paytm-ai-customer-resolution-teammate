import { randomUUID } from "crypto";
import { prisma } from "../config/db";
import {
  ActionExecutionStatus,
  ActionStepPolicyStatus,
  AuditStage,
  HumanReviewStatus,
  SessionOutcomeStatus,
} from "../types";
import {
  OrchestratorSessionState,
  StepExecutionResult,
  RunSessionResult,
  HumanVerdictInput,
} from "./types";
import { plannerService } from "../planner/planner.service";
import { policyEngine } from "../policy/policyEngine";
import { policyConfig } from "../policy/policyConfig";
import { toolRegistry } from "../tools/toolRegistry";
import { outcomeVerifier } from "./outcomeVerifier";
import { auditService } from "./audit.service";
import { customerService } from "../synthetic/customer.service";
import { transactionService } from "../synthetic/transaction.service";
import { NotFoundError, BadRequestError } from "../types/errors";

export class OrchestratorService {
  /**
   * Executes exactly ONE single autonomous step of the resolution workflow.
   * Enforces strict claim check, policy authorization, idempotent execution, and outcome verification.
   */
  async executeStep(sessionId: string): Promise<StepExecutionResult> {
    // 1. Fetch current session from database
    const session = await prisma.resolutionSession.findUnique({
      where: { sessionId },
      include: {
        actionSteps: {
          orderBy: { createdAt: "asc" },
        },
        humanReviews: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!session) {
      throw new NotFoundError(`Resolution session '${sessionId}' was not found.`);
    }

    const previousState = session.currentState as OrchestratorSessionState;

    // 2. Check if session is already in a terminal state
    const terminalStates: OrchestratorSessionState[] = [
      "RESOLVED_SUCCESS",
      "RESOLVED_FAILURE",
      "ESCALATED",
    ];
    if (terminalStates.includes(previousState)) {
      return {
        sessionId,
        previousState,
        currentState: previousState,
        outcomeStatus: session.outcomeStatus,
        message: `Session is already in terminal state '${previousState}'. No further action executed.`,
        isTerminal: true,
      };
    }

    // 3. Check if session is paused waiting for human review
    if (previousState === "HUMAN_REVIEW") {
      const pendingReview = session.humanReviews.find(
        (r) => r.status === HumanReviewStatus.PENDING
      );
      return {
        sessionId,
        previousState,
        currentState: "HUMAN_REVIEW",
        outcomeStatus: session.outcomeStatus,
        humanReviewId: pendingReview?.reviewId,
        message: "Session is paused waiting for human supervisor review.",
        isTerminal: false,
      };
    }

    // 4. In-Flight Step Crash Recovery / Reconciliation
    const inFlightStep = session.actionSteps.find(
      (s) => s.executionStatus === ActionExecutionStatus.PENDING
    );

    if (inFlightStep) {
      return this.reconcileInFlightStep(session, inFlightStep);
    }

    // 5. Concurrency Claim Check (Atomic state update)
    const claimResult = await prisma.resolutionSession.updateMany({
      where: {
        sessionId,
        currentState: session.currentState,
      },
      data: {
        currentState: "GATHERING_CONTEXT",
        updatedAt: new Date(),
      },
    });

    if (claimResult.count === 0) {
      return {
        sessionId,
        previousState,
        currentState: session.currentState as OrchestratorSessionState,
        outcomeStatus: session.outcomeStatus,
        message:
          "Concurrent lock yielded: session was modified or claimed by another worker.",
        isTerminal: false,
      };
    }

    // Log state transition
    await auditService.logEvent({
      sessionId,
      stage: AuditStage.STATE_TRANSITION,
      details: { fromState: previousState, toState: "GATHERING_CONTEXT" },
    });

    // 6. Gather Authoritative Context & Pre-verify Outcome
    const customer = await customerService.getCustomerById(session.customerId);
    if (!customer) {
      await this.transitionSessionState(sessionId, "RESOLVED_FAILURE", SessionOutcomeStatus.VERIFIED_FAILURE);
      return {
        sessionId,
        previousState: "GATHERING_CONTEXT",
        currentState: "RESOLVED_FAILURE",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_FAILURE,
        message: "Customer record not found. Session failed.",
        isTerminal: true,
      };
    }

    let targetTxn = null;
    if (session.targetTransactionId) {
      targetTxn = await transactionService.getTransactionById(session.targetTransactionId);
    }

    const recentTxns = await transactionService.getTransactionHistory(session.customerId, 5);

    // 7. Check if business objective is already verified SUCCESS
    const outcomeCheck = await outcomeVerifier.verifyPaymentOutcome(
      sessionId,
      session.targetTransactionId
    );

    if (outcomeCheck.status === "VERIFIED_SUCCESS") {
      return this.finalizeSuccessfulResolution(sessionId, session, customer.customerId);
    }

    // 8. AI Planner Proposes Next Action
    await this.transitionSessionState(sessionId, "FORMULATING_PLAN");

    const plannerInput = {
      sessionId,
      statedObjective: session.statedObjective,
      authoritativeContext: {
        customer: {
          customerId: customer.customerId,
          name: customer.name,
          accountStatus: customer.accountStatus,
          syntheticBalance: customer.syntheticBalance,
        },
        targetTransaction: targetTxn,
        recentTransactions: recentTxns,
      },
      executionTrace: session.actionSteps.map((s, idx) => ({
        stepOrder: idx + 1,
        toolName: s.toolName,
        policyVerdict: s.policyVerdict as any,
        executionStatus: s.executionStatus as any,
        observation: s.executionResult as any,
        errorMessage: s.errorMessage || undefined,
      })),
    };

    const planResult = await plannerService.planNextAction(plannerInput);

    if (!planResult.success) {
      await auditService.logEvent({
        sessionId,
        stage: AuditStage.PLAN_PROPOSED,
        decisionSummary: `Planner failed: ${planResult.message}`,
        details: { errorCode: planResult.errorCode, rawOutput: planResult.rawOutput },
      });

      // Handle bounded replan or escalation on planner failure
      const updatedRetryCount = session.retryCount + 1;
      if (updatedRetryCount > session.maxRetries) {
        await this.transitionSessionState(sessionId, "ESCALATED", SessionOutcomeStatus.ESCALATED);
        return {
          sessionId,
          previousState: "FORMULATING_PLAN",
          currentState: "ESCALATED",
          outcomeStatus: SessionOutcomeStatus.ESCALATED,
          message: `Planner failure: ${planResult.message}. Max retries exceeded. Escalated to human.`,
          isTerminal: true,
        };
      } else {
        await prisma.resolutionSession.update({
          where: { sessionId },
          data: { retryCount: updatedRetryCount },
        });
        return {
          sessionId,
          previousState: "FORMULATING_PLAN",
          currentState: "FORMULATING_PLAN",
          outcomeStatus: session.outcomeStatus,
          message: `Planner failure: ${planResult.message}. Will retry in next step cycle.`,
          isTerminal: false,
        };
      }
    }

    const proposedAction = planResult.output.proposedAction;

    await auditService.logEvent({
      sessionId,
      stage: AuditStage.PLAN_PROPOSED,
      decisionSummary: planResult.output.decisionSummary,
      contextReferences: { customerId: customer.customerId, transactionId: session.targetTransactionId },
      details: {
        toolName: proposedAction.toolName,
        params: proposedAction.params,
        expectedOutcome: planResult.output.expectedOutcome,
        confidence: planResult.output.confidence,
        model: planResult.model,
      },
    });

    // 9. Generate Provisional ActionStep UUID & Build Parameter Envelope BEFORE Policy
    const provisionalStepId = randomUUID();
    let actionParamsForPolicy: Record<string, unknown> = { ...proposedAction.params };

    if (proposedAction.toolName === "retry_payment") {
      const idempotencyKey = `idemp_${provisionalStepId}`;
      actionParamsForPolicy = {
        originalTransactionId:
          proposedAction.params.originalTransactionId || session.targetTransactionId,
        idempotencyKey,
      };
    }

    const actionForPolicy = {
      toolName: proposedAction.toolName,
      params: actionParamsForPolicy,
    };

    // 10. Deterministic Policy Engine Authorization Gate
    await this.transitionSessionState(sessionId, "EVALUATING_POLICY");

    const policyDecision = await policyEngine.evaluateProposedAction(
      sessionId,
      actionForPolicy
    );

    await auditService.logEvent({
      sessionId,
      stage: AuditStage.POLICY_EVALUATED,
      decisionSummary: policyDecision.reason,
      contextReferences: {
        ruleId: policyDecision.ruleId,
        verdict: policyDecision.verdict,
      },
      details: policyDecision as any,
    });

    // 11. Persist ActionStep with Actual Policy Verdict (using exact provisionalStepId)
    if (policyDecision.verdict === "BLOCKED") {
      const step = await prisma.actionStep.create({
        data: {
          stepId: provisionalStepId,
          sessionId,
          toolName: actionForPolicy.toolName,
          toolParams: actionForPolicy.params as any,
          policyVerdict: ActionStepPolicyStatus.BLOCKED,
          policyRuleTriggered: policyDecision.ruleId,
          executionStatus: ActionExecutionStatus.SKIPPED,
          errorMessage: policyDecision.reason,
        },
      });

      await this.transitionSessionState(sessionId, "RESOLVED_FAILURE", SessionOutcomeStatus.VERIFIED_FAILURE);

      return {
        sessionId,
        previousState: "EVALUATING_POLICY",
        currentState: "RESOLVED_FAILURE",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_FAILURE,
        stepId: step.stepId,
        toolName: actionForPolicy.toolName,
        policyVerdict: ActionStepPolicyStatus.BLOCKED,
        policyRuleTriggered: policyDecision.ruleId,
        executionStatus: ActionExecutionStatus.SKIPPED,
        message: `Action blocked by Policy Engine (${policyDecision.ruleId}): ${policyDecision.reason}`,
        isTerminal: true,
      };
    }

    if (policyDecision.verdict === "REQUIRES_HUMAN") {
      const step = await prisma.actionStep.create({
        data: {
          stepId: provisionalStepId,
          sessionId,
          toolName: actionForPolicy.toolName,
          toolParams: actionForPolicy.params as any,
          policyVerdict: ActionStepPolicyStatus.REQUIRES_HUMAN,
          policyRuleTriggered: policyDecision.ruleId,
          executionStatus: ActionExecutionStatus.SKIPPED,
          errorMessage: policyDecision.reason,
        },
      });

      const humanReview = await prisma.humanReview.create({
        data: {
          sessionId,
          stepId: step.stepId,
          reason: policyDecision.reason,
          proposedTool: actionForPolicy.toolName,
          proposedParams: actionForPolicy.params as any,
          status: HumanReviewStatus.PENDING,
        },
      });

      await this.transitionSessionState(sessionId, "HUMAN_REVIEW");

      return {
        sessionId,
        previousState: "EVALUATING_POLICY",
        currentState: "HUMAN_REVIEW",
        outcomeStatus: session.outcomeStatus,
        stepId: step.stepId,
        toolName: actionForPolicy.toolName,
        policyVerdict: ActionStepPolicyStatus.REQUIRES_HUMAN,
        policyRuleTriggered: policyDecision.ruleId,
        executionStatus: ActionExecutionStatus.SKIPPED,
        humanReviewId: humanReview.reviewId,
        message: `Action requires human supervisor review (${policyDecision.ruleId}): ${policyDecision.reason}`,
        isTerminal: false,
      };
    }

    // 12. Policy Verdict is ALLOWED: Create ActionStep & Execute Tool
    const step = await prisma.actionStep.create({
      data: {
        stepId: provisionalStepId,
        sessionId,
        toolName: actionForPolicy.toolName,
        toolParams: actionForPolicy.params as any,
        policyVerdict: ActionStepPolicyStatus.ALLOWED,
        policyRuleTriggered: policyDecision.ruleId,
        executionStatus: ActionExecutionStatus.PENDING,
      },
    });

    // Execute tool
    await this.transitionSessionState(sessionId, "EXECUTING_STEP");
    const startTime = Date.now();
    const toolResult = await toolRegistry.executeTool(
      actionForPolicy.toolName,
      actionForPolicy.params
    );
    const latencyMs = Date.now() - startTime;

    await this.transitionSessionState(sessionId, "OBSERVING_STEP");

    if (toolResult.success) {
      await prisma.actionStep.update({
        where: { stepId: step.stepId },
        data: {
          executionStatus: ActionExecutionStatus.SUCCESS,
          executionResult: toolResult.data as any,
          executedAt: new Date(),
        },
      });

      await auditService.logEvent({
        sessionId,
        stage: AuditStage.TOOL_EXECUTED,
        decisionSummary: `Tool '${actionForPolicy.toolName}' executed successfully in ${latencyMs}ms.`,
        contextReferences: { stepId: step.stepId, toolName: actionForPolicy.toolName },
        details: { result: toolResult.data },
      });

      // Run Outcome Verification
      await this.transitionSessionState(sessionId, "VERIFYING_OUTCOME");
      const postOutcome = await outcomeVerifier.verifyPaymentOutcome(
        sessionId,
        session.targetTransactionId
      );

      await auditService.logEvent({
        sessionId,
        stage: AuditStage.OUTCOME_VERIFIED,
        decisionSummary: postOutcome.reason,
        details: postOutcome as any,
      });

      if (postOutcome.status === "VERIFIED_SUCCESS") {
        return this.finalizeSuccessfulResolution(sessionId, session, customer.customerId);
      }

      return {
        sessionId,
        previousState: "OBSERVING_STEP",
        currentState: "OBSERVING_STEP",
        outcomeStatus: session.outcomeStatus,
        stepId: step.stepId,
        toolName: actionForPolicy.toolName,
        policyVerdict: ActionStepPolicyStatus.ALLOWED,
        executionStatus: ActionExecutionStatus.SUCCESS,
        executionResult: toolResult.data,
        message: `Tool '${actionForPolicy.toolName}' executed successfully. Outcome pending verification.`,
        isTerminal: false,
      };
    } else {
      // Tool failed
      await prisma.actionStep.update({
        where: { stepId: step.stepId },
        data: {
          executionStatus: ActionExecutionStatus.FAILED,
          errorMessage: toolResult.error?.message || "Tool execution failed.",
          executedAt: new Date(),
        },
      });

      await auditService.logEvent({
        sessionId,
        stage: AuditStage.TOOL_EXECUTED,
        decisionSummary: `Tool '${actionForPolicy.toolName}' failed: ${toolResult.error?.message}`,
        contextReferences: { stepId: step.stepId, toolName: actionForPolicy.toolName },
        details: { error: toolResult.error },
      });

      // Bounded replan check
      const newRetryCount = session.retryCount + 1;
      if (newRetryCount > session.maxRetries || !toolResult.error?.retryable) {
        await this.transitionSessionState(sessionId, "ESCALATED", SessionOutcomeStatus.ESCALATED);
        return {
          sessionId,
          previousState: "OBSERVING_STEP",
          currentState: "ESCALATED",
          outcomeStatus: SessionOutcomeStatus.ESCALATED,
          stepId: step.stepId,
          toolName: actionForPolicy.toolName,
          policyVerdict: ActionStepPolicyStatus.ALLOWED,
          executionStatus: ActionExecutionStatus.FAILED,
          message: `Tool execution failed (${toolResult.error?.code}): ${toolResult.error?.message}. Escalated to human.`,
          isTerminal: true,
        };
      } else {
        await prisma.resolutionSession.update({
          where: { sessionId },
          data: {
            retryCount: newRetryCount,
            currentState: "FORMULATING_PLAN",
          },
        });
        return {
          sessionId,
          previousState: "OBSERVING_STEP",
          currentState: "FORMULATING_PLAN",
          outcomeStatus: session.outcomeStatus,
          stepId: step.stepId,
          toolName: actionForPolicy.toolName,
          policyVerdict: ActionStepPolicyStatus.ALLOWED,
          executionStatus: ActionExecutionStatus.FAILED,
          message: `Tool failed (${toolResult.error?.code}). Re-entering planning cycle (attempt ${newRetryCount}/${session.maxRetries}).`,
          isTerminal: false,
        };
      }
    }
  }

  /**
   * Reconciles an in-flight PENDING ActionStep after a server crash or timeout.
   */
  private async reconcileInFlightStep(
    session: any,
    pendingStep: any
  ): Promise<StepExecutionResult> {
    const idempotencyKey = `idemp_${pendingStep.stepId}`;

    if (pendingStep.toolName === "retry_payment") {
      const existingTxn = await prisma.syntheticTransaction.findUnique({
        where: { idempotencyKey },
      });

      if (existingTxn) {
        if (existingTxn.status === "SUCCESS") {
          await prisma.actionStep.update({
            where: { stepId: pendingStep.stepId },
            data: {
              executionStatus: ActionExecutionStatus.SUCCESS,
              executionResult: {
                newTransactionId: existingTxn.transactionId,
                status: "SUCCESS",
                recoveredFromCrash: true,
              } as any,
              executedAt: new Date(),
            },
          });

          return this.finalizeSuccessfulResolution(
            session.sessionId,
            session,
            session.customerId
          );
        } else {
          await prisma.actionStep.update({
            where: { stepId: pendingStep.stepId },
            data: {
              executionStatus: ActionExecutionStatus.FAILED,
              errorMessage: existingTxn.failureReason || "Transaction failed during prior attempt.",
              executedAt: new Date(),
            },
          });

          await this.transitionSessionState(
            session.sessionId,
            "FORMULATING_PLAN"
          );

          return {
            sessionId: session.sessionId,
            previousState: "EXECUTING_STEP",
            currentState: "FORMULATING_PLAN",
            outcomeStatus: session.outcomeStatus,
            stepId: pendingStep.stepId,
            toolName: pendingStep.toolName,
            message: "In-flight step reconciled as failed. Re-entering plan.",
            isTerminal: false,
          };
        }
      }
    }

    // If transaction did not exist, execute with the same idempotency key safely
    const toolParams = {
      ...(pendingStep.toolParams as Record<string, unknown>),
      ...(pendingStep.toolName === "retry_payment" ? { idempotencyKey } : {}),
    };

    const toolResult = await toolRegistry.executeTool(
      pendingStep.toolName,
      toolParams
    );

    const executionStatus = toolResult.success
      ? ActionExecutionStatus.SUCCESS
      : ActionExecutionStatus.FAILED;

    await prisma.actionStep.update({
      where: { stepId: pendingStep.stepId },
      data: {
        executionStatus,
        executionResult: (toolResult.data as any) || undefined,
        errorMessage: toolResult.error?.message,
        executedAt: new Date(),
      },
    });

    if (toolResult.success) {
      return this.finalizeSuccessfulResolution(
        session.sessionId,
        session,
        session.customerId
      );
    }

    await this.transitionSessionState(session.sessionId, "ESCALATED", SessionOutcomeStatus.ESCALATED);
    return {
      sessionId: session.sessionId,
      previousState: "EXECUTING_STEP",
      currentState: "ESCALATED",
      outcomeStatus: SessionOutcomeStatus.ESCALATED,
      stepId: pendingStep.stepId,
      message: "Crash recovery step execution failed. Escalated.",
      isTerminal: true,
    };
  }

  /**
   * Finalizes resolution by sending customer notification through standard Policy Engine gate.
   */
  private async finalizeSuccessfulResolution(
    sessionId: string,
    session: any,
    customerId: string
  ): Promise<StepExecutionResult> {
    const provisionalStepId = randomUUID();
    // Propose customer notification tool
    const notifAction = {
      toolName: "send_customer_notification",
      params: {
        customerId,
        message:
          "Your transaction issue has been successfully resolved and processed.",
        channel: "IN_APP",
      },
    };

    // Evaluate policy for notification
    const notifPolicy = await policyEngine.evaluateProposedAction(
      sessionId,
      notifAction
    );

    if (notifPolicy.verdict === "ALLOWED") {
      const notifStep = await prisma.actionStep.create({
        data: {
          stepId: provisionalStepId,
          sessionId,
          toolName: "send_customer_notification",
          toolParams: notifAction.params as any,
          policyVerdict: ActionStepPolicyStatus.ALLOWED,
          policyRuleTriggered: notifPolicy.ruleId,
          executionStatus: ActionExecutionStatus.PENDING,
        },
      });

      const notifResult = await toolRegistry.executeTool(
        "send_customer_notification",
        notifAction.params
      );

      await prisma.actionStep.update({
        where: { stepId: notifStep.stepId },
        data: {
          executionStatus: notifResult.success
            ? ActionExecutionStatus.SUCCESS
            : ActionExecutionStatus.FAILED,
          executionResult: (notifResult.data as any) || undefined,
          errorMessage: notifResult.error?.message,
          executedAt: new Date(),
        },
      });
    }

    // Transition session to terminal RESOLVED_SUCCESS
    await prisma.resolutionSession.update({
      where: { sessionId },
      data: {
        currentState: "RESOLVED_SUCCESS",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_SUCCESS,
      },
    });

    await auditService.logEvent({
      sessionId,
      stage: AuditStage.STATE_TRANSITION,
      details: {
        fromState: session.currentState,
        toState: "RESOLVED_SUCCESS",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_SUCCESS,
      },
    });

    return {
      sessionId,
      previousState: session.currentState as OrchestratorSessionState,
      currentState: "RESOLVED_SUCCESS",
      outcomeStatus: SessionOutcomeStatus.VERIFIED_SUCCESS,
      message:
        "Business objective verified successfully. Customer notified and ticket resolved.",
      isTerminal: true,
    };
  }

  /**
   * Autonomous runner: loops step execution until reaching terminal state or human review.
   */
  async runSession(
    sessionId: string,
    maxIterations: number = 5
  ): Promise<RunSessionResult> {
    const history: StepExecutionResult[] = [];
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;
      const stepRes = await this.executeStep(sessionId);
      history.push(stepRes);

      if (
        stepRes.isTerminal ||
        stepRes.currentState === "HUMAN_REVIEW" ||
        stepRes.message.includes("Concurrent lock yielded")
      ) {
        break;
      }
    }

    const lastResult = history[history.length - 1];

    return {
      sessionId,
      finalState: lastResult.currentState,
      finalOutcomeStatus: lastResult.outcomeStatus,
      stepsExecuted: history.length,
      history,
      message: lastResult.message,
    };
  }

  /**
   * Handles human supervisor review verdict (APPROVED | REJECTED | MODIFIED).
   * Re-evaluates policy with fresh authoritative context before executing any mutating tool.
   */
  async submitHumanVerdict(
    reviewId: string,
    input: HumanVerdictInput
  ): Promise<StepExecutionResult> {
    const review = await prisma.humanReview.findUnique({
      where: { reviewId },
      include: { session: true },
    });

    if (!review) {
      throw new NotFoundError(`HumanReview '${reviewId}' not found.`);
    }

    if (review.status !== HumanReviewStatus.PENDING) {
      throw new BadRequestError(
        `HumanReview '${reviewId}' is already resolved with status '${review.status}'.`
      );
    }

    const sessionId = review.sessionId;
    const session = review.session;

    // Reject if session is already in a terminal state
    const terminalStates: OrchestratorSessionState[] = [
      "RESOLVED_SUCCESS",
      "RESOLVED_FAILURE",
      "ESCALATED",
    ];
    if (terminalStates.includes(session.currentState as OrchestratorSessionState)) {
      throw new BadRequestError(
        `Session '${sessionId}' is already in terminal state '${session.currentState}'. Cannot submit review verdict.`
      );
    }

    // Atomic conditional update on HumanReview status to prevent concurrent double resolution
    const updateResult = await prisma.humanReview.updateMany({
      where: {
        reviewId,
        status: HumanReviewStatus.PENDING,
      },
      data: {
        status: input.verdict as HumanReviewStatus,
        reviewerNotes: input.reviewerNotes || null,
        resolvedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      throw new BadRequestError(
        `HumanReview '${reviewId}' was already resolved concurrently.`
      );
    }

    await auditService.logEvent({
      sessionId,
      stage: AuditStage.HUMAN_DECIDED,
      decisionSummary: `Supervisor submitted verdict: ${input.verdict}`,
      contextReferences: { reviewId, verdict: input.verdict },
      details: { input },
    });

    if (input.verdict === "REJECTED") {
      await this.transitionSessionState(
        sessionId,
        "RESOLVED_FAILURE",
        SessionOutcomeStatus.VERIFIED_FAILURE
      );

      return {
        sessionId,
        previousState: "HUMAN_REVIEW",
        currentState: "RESOLVED_FAILURE",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_FAILURE,
        humanReviewId: reviewId,
        message: "Action rejected by supervisor. Session terminated.",
        isTerminal: true,
      };
    }

    // For APPROVED or MODIFIED, re-evaluate against PolicyEngine with fresh context and provisional UUID
    const rawParams =
      input.verdict === "MODIFIED" && input.modifiedParams
        ? input.modifiedParams
        : (review.proposedParams as Record<string, unknown>);

    const provisionalStepId = randomUUID();
    let actionParamsForPolicy: Record<string, unknown> = { ...rawParams };

    if (review.proposedTool === "retry_payment") {
      const idempotencyKey = `idemp_${provisionalStepId}`;
      actionParamsForPolicy = {
        originalTransactionId:
          rawParams.originalTransactionId || session.targetTransactionId,
        idempotencyKey,
      };
    }

    const actionForPolicy = {
      toolName: review.proposedTool,
      params: actionParamsForPolicy,
    };

    // Supervisor has approved/modified, so autonomous threshold check is satisfied,
    // but all other invariant safety checks (active customer, txn exists, binding, idempotency, etc.) MUST pass.
    const policyDecision = await policyEngine.evaluateProposedAction(
      sessionId,
      actionForPolicy,
      {
        ...policyConfig,
        maxAutonomousRetryAmount: Infinity,
      }
    );

    await auditService.logEvent({
      sessionId,
      stage: AuditStage.POLICY_EVALUATED,
      decisionSummary: `Policy re-evaluation for supervisor ${input.verdict}: ${policyDecision.reason}`,
      contextReferences: {
        ruleId: policyDecision.ruleId,
        verdict: policyDecision.verdict,
        reviewId,
      },
      details: policyDecision as any,
    });

    if (policyDecision.verdict === "BLOCKED") {
      const step = await prisma.actionStep.create({
        data: {
          stepId: provisionalStepId,
          sessionId,
          toolName: actionForPolicy.toolName,
          toolParams: actionForPolicy.params as any,
          policyVerdict: ActionStepPolicyStatus.BLOCKED,
          policyRuleTriggered: policyDecision.ruleId,
          executionStatus: ActionExecutionStatus.SKIPPED,
          errorMessage: policyDecision.reason,
        },
      });

      await this.transitionSessionState(
        sessionId,
        "RESOLVED_FAILURE",
        SessionOutcomeStatus.VERIFIED_FAILURE
      );

      return {
        sessionId,
        previousState: "HUMAN_REVIEW",
        currentState: "RESOLVED_FAILURE",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_FAILURE,
        stepId: step.stepId,
        toolName: actionForPolicy.toolName,
        policyVerdict: ActionStepPolicyStatus.BLOCKED,
        policyRuleTriggered: policyDecision.ruleId,
        executionStatus: ActionExecutionStatus.SKIPPED,
        message: `Supervisor action blocked by Policy Engine (${policyDecision.ruleId}): ${policyDecision.reason}`,
        isTerminal: true,
      };
    }

    // If ALLOWED, persist ActionStep and execute
    const step = await prisma.actionStep.create({
      data: {
        stepId: provisionalStepId,
        sessionId,
        toolName: actionForPolicy.toolName,
        toolParams: actionForPolicy.params as any,
        policyVerdict: ActionStepPolicyStatus.ALLOWED,
        policyRuleTriggered: `HUMAN_OVERRIDE_${input.verdict}`,
        executionStatus: ActionExecutionStatus.PENDING,
      },
    });

    await this.transitionSessionState(sessionId, "EXECUTING_STEP");
    const startTime = Date.now();
    const toolResult = await toolRegistry.executeTool(
      actionForPolicy.toolName,
      actionForPolicy.params
    );
    const latencyMs = Date.now() - startTime;

    if (toolResult.success) {
      await prisma.actionStep.update({
        where: { stepId: step.stepId },
        data: {
          executionStatus: ActionExecutionStatus.SUCCESS,
          executionResult: toolResult.data as any,
          executedAt: new Date(),
        },
      });

      await auditService.logEvent({
        sessionId,
        stage: AuditStage.TOOL_EXECUTED,
        decisionSummary: `Human-authorized tool '${actionForPolicy.toolName}' executed successfully in ${latencyMs}ms.`,
        contextReferences: { stepId: step.stepId, toolName: actionForPolicy.toolName },
        details: { result: toolResult.data },
      });

      return this.finalizeSuccessfulResolution(
        sessionId,
        session,
        session.customerId
      );
    } else {
      await prisma.actionStep.update({
        where: { stepId: step.stepId },
        data: {
          executionStatus: ActionExecutionStatus.FAILED,
          errorMessage: toolResult.error?.message,
          executedAt: new Date(),
        },
      });

      await auditService.logEvent({
        sessionId,
        stage: AuditStage.TOOL_EXECUTED,
        decisionSummary: `Human-authorized tool '${actionForPolicy.toolName}' failed: ${toolResult.error?.message}`,
        contextReferences: { stepId: step.stepId, toolName: actionForPolicy.toolName },
        details: { error: toolResult.error },
      });

      await this.transitionSessionState(sessionId, "ESCALATED", SessionOutcomeStatus.ESCALATED);

      return {
        sessionId,
        previousState: "EXECUTING_STEP",
        currentState: "ESCALATED",
        outcomeStatus: SessionOutcomeStatus.ESCALATED,
        stepId: step.stepId,
        toolName: actionForPolicy.toolName,
        message: `Human-authorized tool execution failed: ${toolResult.error?.message}`,
        isTerminal: true,
      };
    }
  }

  /**
   * Helper to transition session state in DB and log audit event.
   */
  private async transitionSessionState(
    sessionId: string,
    nextState: OrchestratorSessionState,
    outcomeStatus?: SessionOutcomeStatus
  ): Promise<void> {
    await prisma.resolutionSession.update({
      where: { sessionId },
      data: {
        currentState: nextState,
        outcomeStatus: outcomeStatus || undefined,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Retrieves complete session status, execution history, and audit log trace.
   */
  async getSessionStatus(sessionId: string): Promise<any> {
    const session = await prisma.resolutionSession.findUnique({
      where: { sessionId },
      include: {
        customer: true,
        actionSteps: {
          orderBy: { createdAt: "asc" },
        },
        auditLogEntries: {
          orderBy: { timestamp: "asc" },
        },
        humanReviews: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!session) {
      throw new NotFoundError(`Resolution session '${sessionId}' not found.`);
    }

    let targetTransaction = null;
    if (session.targetTransactionId) {
      const txn = await prisma.syntheticTransaction.findUnique({
        where: { transactionId: session.targetTransactionId },
      });
      if (txn) {
        targetTransaction = {
          transactionId: txn.transactionId,
          amount: txn.amount.toNumber(),
          billerOrMerchant: txn.billerOrMerchant,
          status: txn.status,
          failureReason: txn.failureReason,
        };
      }
    }

    return {
      sessionId: session.sessionId,
      customerId: session.customerId,
      targetTransactionId: session.targetTransactionId,
      targetTransaction,
      statedObjective: session.statedObjective,
      currentState: session.currentState,
      retryCount: session.retryCount,
      maxRetries: session.maxRetries,
      outcomeStatus: session.outcomeStatus,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      customer: {
        name: session.customer.name,
        phone: session.customer.phone,
        accountStatus: session.customer.accountStatus,
        syntheticBalance: session.customer.syntheticBalance.toNumber(),
      },
      actionSteps: session.actionSteps,
      humanReviews: session.humanReviews,
      auditLogEntries: session.auditLogEntries.map((log) => ({
        id: log.id.toString(),
        stage: log.stage,
        decisionSummary: log.decisionSummary,
        contextReferences: log.contextReferences,
        details: log.details,
        timestamp: log.timestamp,
      })),
    };
  }
}

export const orchestratorService = new OrchestratorService();
