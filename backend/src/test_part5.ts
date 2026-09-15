import { prisma } from "./config/db";
import { orchestratorService } from "./orchestrator/orchestrator.service";
import { sessionService } from "./services/session.service";
import { plannerService } from "./planner/planner.service";
import { MockLlmAdapter } from "./planner/adapters/geminiAdapter";
import {
  ActionExecutionStatus,
  ActionStepPolicyStatus,
  CustomerAccountStatus,
  HumanReviewStatus,
  SessionOutcomeStatus,
  TransactionStatus,
} from "./types";

// Helper assert function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("=== STARTING PART 5: RESOLUTION ORCHESTRATOR TESTS ===");
  console.log("=======================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    process.stdout.write(`TEST ${totalTests}: ${name} ... `);
    try {
      await fn();
      passedTests++;
      console.log(" PASSED");
    } catch (err: any) {
      console.log(" FAILED");
      console.error(err);
      process.exit(1);
    }
  }

  // Ensure DB connection
  await prisma.$connect();

  // Clean up any test records from prior runs
  await prisma.auditLogEntry.deleteMany({});
  await prisma.humanReview.deleteMany({});
  await prisma.actionStep.deleteMany({});
  await prisma.resolutionSession.deleteMany({});
  await prisma.syntheticTransaction.deleteMany({});
  await prisma.syntheticCustomer.deleteMany({});

  // --------------------------------------------------------------------------
  // TEST 1: Happy Path Autonomous Resolution
  // --------------------------------------------------------------------------
  await test("Happy Path: Failed ₹1,250 electricity bill -> Retry -> Notification -> RESOLVED_SUCCESS", async () => {
    // 1. Seed customer & failed transaction
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_happy_1",
        name: "Aarav Sharma",
        phone: "+919876543210",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 5000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_happy_1",
        customerId: customer.customerId,
        amount: 1250,
        billerOrMerchant: "Tata Power",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "GATEWAY_TIMEOUT",
      },
    });

    // 2. Intake session
    const intakeResult = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const sessionId = intakeResult.sessionId;
    assert(sessionId !== undefined, "Session ID should exist");

    // 3. Setup mock LLM adapter
    let plannerCallCount = 0;
    plannerService.setAdapter(
      new MockLlmAdapter((prompt) => {
        plannerCallCount++;
        if (plannerCallCount === 1) {
          return JSON.stringify({
            decisionSummary: "Customer electricity bill payment failed due to gateway timeout. Retry is appropriate.",
            proposedAction: {
              toolName: "retry_payment",
              params: {
                originalTransactionId: txn.transactionId,
              },
            },
            expectedOutcome: "Payment succeeds at biller gateway.",
            confidence: 0.95,
          });
        } else {
          return JSON.stringify({
            decisionSummary: "Transaction retry succeeded. Notify customer of success.",
            proposedAction: {
              toolName: "send_customer_notification",
              params: {
                customerId: customer.customerId,
                message: "Your electricity payment of Rs 1,250 has succeeded!",
                channel: "SMS",
              },
            },
            expectedOutcome: "Customer receives confirmation SMS.",
            confidence: 0.99,
          });
        }
      })
    );

    // 4. Run session to completion
    const runResult = await orchestratorService.runSession(sessionId, 5);

    assert(runResult.finalState === "RESOLVED_SUCCESS", `Expected RESOLVED_SUCCESS, got ${runResult.finalState}`);
    assert(runResult.finalOutcomeStatus === SessionOutcomeStatus.VERIFIED_SUCCESS, `Expected VERIFIED_SUCCESS, got ${runResult.finalOutcomeStatus}`);
    assert(runResult.stepsExecuted === 1, `Expected 1 step cycle executed, got ${runResult.stepsExecuted}`);

    // 5. Verify DB state
    const sessionInDb = await prisma.resolutionSession.findUnique({
      where: { sessionId },
      include: { actionSteps: true, auditLogEntries: true },
    });

    assert(sessionInDb?.currentState === "RESOLVED_SUCCESS", "DB session should be RESOLVED_SUCCESS");
    assert(sessionInDb?.outcomeStatus === SessionOutcomeStatus.VERIFIED_SUCCESS, "DB outcome should be VERIFIED_SUCCESS");
    assert(sessionInDb?.actionSteps.length === 2, "Should have 2 action steps recorded");
    assert(sessionInDb?.actionSteps[0].toolName === "retry_payment", "Step 1 should be retry_payment");
    assert(sessionInDb?.actionSteps[0].policyVerdict === ActionStepPolicyStatus.ALLOWED, "Step 1 policy should be ALLOWED");
    assert(sessionInDb?.actionSteps[0].executionStatus === ActionExecutionStatus.SUCCESS, "Step 1 execution should be SUCCESS");
    assert(sessionInDb?.actionSteps[1].toolName === "send_customer_notification", "Step 2 should be send_customer_notification");

    const retryResult = sessionInDb?.actionSteps[0].executionResult as any;
    assert(retryResult?.newTransactionId !== undefined, "Retry step should return newTransactionId");

    const newTxn = await prisma.syntheticTransaction.findUnique({
      where: { transactionId: retryResult.newTransactionId },
    });
    assert(newTxn?.status === TransactionStatus.SUCCESS, "New retry transaction in DB should be SUCCESS");
  });

  // --------------------------------------------------------------------------
  // TEST 2: High-Value Payment -> REQUIRES_HUMAN -> Supervisor Approval -> SUCCESS
  // --------------------------------------------------------------------------
  await test("High-Value Payment (₹3,500): Policy REQUIRES_HUMAN -> Supervisor APPROVED -> RESOLVED_SUCCESS", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_highval_1",
        name: "Pooja Patel",
        phone: "+919876543211",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 10000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_highval_1",
        customerId: customer.customerId,
        amount: 3500, // > ₹2,000 threshold
        billerOrMerchant: "Adani Electricity",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "NETWORK_ERROR",
      },
    });

    const intakeResult = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const sessionId = intakeResult.sessionId;

    // Planner proposes retry_payment
    plannerService.setAdapter(
      new MockLlmAdapter((prompt) => {
        return JSON.stringify({
          decisionSummary: "High value electricity bill failed. Proposing retry.",
          proposedAction: {
            toolName: "retry_payment",
            params: {
              originalTransactionId: txn.transactionId,
            },
          },
          expectedOutcome: "Retry execution will be evaluated by policy.",
          confidence: 0.9,
        });
      })
    );

    // Step 1: Must hit PolicyEngine and get paused in HUMAN_REVIEW
    const step1Result = await orchestratorService.executeStep(sessionId);

    assert(step1Result.currentState === "HUMAN_REVIEW", `Expected HUMAN_REVIEW, got ${step1Result.currentState}`);
    assert(step1Result.policyVerdict === ActionStepPolicyStatus.REQUIRES_HUMAN, "Expected REQUIRES_HUMAN verdict");
    assert(step1Result.humanReviewId !== undefined, "HumanReview ID must be returned");

    const reviewId = step1Result.humanReviewId!;

    // Verify HumanReview record in DB
    const reviewInDb = await prisma.humanReview.findUnique({
      where: { reviewId },
    });
    assert(reviewInDb?.status === HumanReviewStatus.PENDING, "Review status should be PENDING");
    assert(reviewInDb?.proposedTool === "retry_payment", "Proposed tool should be retry_payment");

    // Supervisor submits APPROVAL
    const verdictResult = await orchestratorService.submitHumanVerdict(reviewId, {
      verdict: "APPROVED",
      reviewerNotes: "Verified customer identity and transaction history. Approved retry.",
    });

    assert(verdictResult.currentState === "RESOLVED_SUCCESS", `Expected RESOLVED_SUCCESS, got ${verdictResult.currentState}`);
    assert(verdictResult.outcomeStatus === SessionOutcomeStatus.VERIFIED_SUCCESS, "Expected outcome VERIFIED_SUCCESS");

    // Check DB
    const resolvedReview = await prisma.humanReview.findUnique({
      where: { reviewId },
    });
    assert(resolvedReview?.status === HumanReviewStatus.APPROVED, "Review should be APPROVED");
  });

  // --------------------------------------------------------------------------
  // TEST 3: High-Value Payment -> Supervisor Rejection -> RESOLVED_FAILURE
  // --------------------------------------------------------------------------
  await test("Supervisor Rejection: High-Value -> REQUIRES_HUMAN -> REJECTED -> RESOLVED_FAILURE", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_reject_1",
        name: "Vikram Malhotra",
        phone: "+919876543212",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 15000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_reject_1",
        customerId: customer.customerId,
        amount: 4500,
        billerOrMerchant: "Airtel Postpaid",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "BILLER_OFFLINE",
      },
    });

    const intakeResult = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const sessionId = intakeResult.sessionId;

    plannerService.setAdapter(
      new MockLlmAdapter((prompt) =>
        JSON.stringify({
          decisionSummary: "Postpaid bill failed.",
          proposedAction: {
            toolName: "retry_payment",
            params: {
              originalTransactionId: txn.transactionId,
            },
          },
          expectedOutcome: "Retry payment",
          confidence: 0.9,
        })
      )
    );

    const step1 = await orchestratorService.executeStep(sessionId);
    assert(step1.currentState === "HUMAN_REVIEW", "Should be in HUMAN_REVIEW");

    const reviewId = step1.humanReviewId!;

    // Supervisor rejects
    const verdictResult = await orchestratorService.submitHumanVerdict(reviewId, {
      verdict: "REJECTED",
      reviewerNotes: "Suspicious transaction frequency. Denied.",
    });

    assert(verdictResult.currentState === "RESOLVED_FAILURE", `Expected RESOLVED_FAILURE, got ${verdictResult.currentState}`);
    assert(verdictResult.outcomeStatus === SessionOutcomeStatus.VERIFIED_FAILURE, "Expected VERIFIED_FAILURE");

    const sessionInDb = await prisma.resolutionSession.findUnique({
      where: { sessionId },
    });
    assert(sessionInDb?.currentState === "RESOLVED_FAILURE", "DB state should be RESOLVED_FAILURE");
  });

  // --------------------------------------------------------------------------
  // TEST 4: Policy BLOCKED (Customer Account FROZEN)
  // --------------------------------------------------------------------------
  await test("Policy BLOCKED: Frozen Account -> Policy BLOCKED -> Session Terminated", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_frozen_1",
        name: "Neha Gupta",
        phone: "+919876543213",
        accountStatus: CustomerAccountStatus.FROZEN, // Frozen!
        syntheticBalance: 2000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_frozen_1",
        customerId: customer.customerId,
        amount: 500,
        billerOrMerchant: "BESCOM",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "ACCOUNT_INACTIVE",
      },
    });

    const intakeResult = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const sessionId = intakeResult.sessionId;

    plannerService.setAdapter(
      new MockLlmAdapter((prompt) =>
        JSON.stringify({
          decisionSummary: "Retry requested for BESCOM bill.",
          proposedAction: {
            toolName: "retry_payment",
            params: {
              originalTransactionId: txn.transactionId,
            },
          },
          expectedOutcome: "Retry bill payment.",
          confidence: 0.9,
        })
      )
    );

    const stepResult = await orchestratorService.executeStep(sessionId);

    assert(stepResult.policyVerdict === ActionStepPolicyStatus.BLOCKED, "Policy verdict should be BLOCKED");
    assert(stepResult.currentState === "RESOLVED_FAILURE", "Session should transition to RESOLVED_FAILURE on block");
    assert(stepResult.isTerminal === true, "Result should be marked terminal");

    const sessionInDb = await prisma.resolutionSession.findUnique({
      where: { sessionId },
      include: { actionSteps: true },
    });
    assert(sessionInDb?.currentState === "RESOLVED_FAILURE", "DB session state should be RESOLVED_FAILURE");
    assert(sessionInDb?.actionSteps.length === 1, "Should have 1 recorded blocked step");
    assert(sessionInDb?.actionSteps[0].policyVerdict === ActionStepPolicyStatus.BLOCKED, "Step policy verdict in DB should be BLOCKED");
  });

  // --------------------------------------------------------------------------
  // TEST 5: Crash Recovery & In-Flight Step Reconciliation
  // --------------------------------------------------------------------------
  await test("Crash Recovery: PENDING ActionStep reconciled safely on resume", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_crash_1",
        name: "Rohan Verma",
        phone: "+919876543214",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 5000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_crash_1",
        customerId: customer.customerId,
        amount: 800,
        billerOrMerchant: "Jio Fiber",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
      },
    });

    const intakeResult = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const sessionId = intakeResult.sessionId;

    // Simulate an in-flight crash: Create an ActionStep with PENDING execution status
    const inFlightStep = await prisma.actionStep.create({
      data: {
        sessionId,
        toolName: "retry_payment",
        toolParams: { originalTransactionId: txn.transactionId } as any,
        policyVerdict: ActionStepPolicyStatus.ALLOWED,
        policyRuleTriggered: null,
        executionStatus: ActionExecutionStatus.PENDING,
      },
    });

    // Run executeStep -> Orchestrator should detect in-flight step and reconcile
    const reconcileResult = await orchestratorService.executeStep(sessionId);

    assert(reconcileResult.currentState === "RESOLVED_SUCCESS", "Reconciled session should reach RESOLVED_SUCCESS");

    const updatedStepInDb = await prisma.actionStep.findUnique({
      where: { stepId: inFlightStep.stepId },
    });
    assert(
      updatedStepInDb?.executionStatus === ActionExecutionStatus.SUCCESS,
      "Step executionStatus in DB should be updated to SUCCESS"
    );
  });

  // --------------------------------------------------------------------------
  // TEST 6: Session Status and Full Audit Log Trace API
  // --------------------------------------------------------------------------
  await test("Status & Audit Log: getSessionStatus returns full timeline and customer state", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_status_1",
        name: "Sneha Reddy",
        phone: "+919876543215",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 3000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_status_1",
        customerId: customer.customerId,
        amount: 600,
        billerOrMerchant: "BWSSB Water",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
      },
    });

    const intake = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const status = await orchestratorService.getSessionStatus(intake.sessionId);

    assert(status.sessionId === intake.sessionId, "Session ID matches");
    assert(status.customer.name === "Sneha Reddy", "Customer name matches");
    assert(status.auditLogEntries.length >= 1, "Audit logs should contain at least INTAKE_CREATED");
  });

  // --------------------------------------------------------------------------
  // TEST 7: Supervisor Modification (MODIFIED verdict)
  // --------------------------------------------------------------------------
  await test("Supervisor Modification: MODIFIED verdict executes with modified parameters", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_mod_1",
        name: "Karan Johar",
        phone: "+919876543216",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 5000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_mod_1",
        customerId: customer.customerId,
        amount: 2500, // > ₹2,000 threshold
        billerOrMerchant: "BESCOM Electricity",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "GATEWAY_TIMEOUT",
      },
    });

    const intake = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    plannerService.setAdapter(
      new MockLlmAdapter(() =>
        JSON.stringify({
          decisionSummary: "Retry high-value transaction.",
          proposedAction: {
            toolName: "retry_payment",
            params: { originalTransactionId: txn.transactionId },
          },
          expectedOutcome: "Retry payment",
          confidence: 0.9,
        })
      )
    );

    const step1 = await orchestratorService.executeStep(intake.sessionId);
    assert(step1.currentState === "HUMAN_REVIEW", "Must be in HUMAN_REVIEW");

    const reviewId = step1.humanReviewId!;

    // Supervisor modifies parameters and approves
    const verdictResult = await orchestratorService.submitHumanVerdict(reviewId, {
      verdict: "MODIFIED",
      reviewerNotes: "Adjusted originalTransactionId binding.",
      modifiedParams: { originalTransactionId: txn.transactionId },
    });

    assert(verdictResult.currentState === "RESOLVED_SUCCESS", "Expected RESOLVED_SUCCESS after modified verdict execution");
    assert(verdictResult.outcomeStatus === SessionOutcomeStatus.VERIFIED_SUCCESS, "Expected outcome VERIFIED_SUCCESS");
  });

  // --------------------------------------------------------------------------
  // TEST 8: Terminal State Protection (No further execution when terminal)
  // --------------------------------------------------------------------------
  await test("Terminal State Protection: Stepping terminal session returns isTerminal immediately", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_term_1",
        name: "Tanvi Shah",
        phone: "+919876543217",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 1000,
      },
    });

    const session = await prisma.resolutionSession.create({
      data: {
        customerId: customer.customerId,
        statedObjective: "RETRY_PAYMENT",
        currentState: "RESOLVED_SUCCESS",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_SUCCESS,
      },
    });

    const stepResult = await orchestratorService.executeStep(session.sessionId);
    assert(stepResult.isTerminal === true, "Must return isTerminal: true");
    assert(stepResult.currentState === "RESOLVED_SUCCESS", "State must remain RESOLVED_SUCCESS");
  });

  // --------------------------------------------------------------------------
  // TEST 9: Outcome Pre-Check: Transaction already SUCCESS skips retry
  // --------------------------------------------------------------------------
  await test("Outcome Pre-Check: Already SUCCESS transaction short-circuits directly to resolution", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_precheck_1",
        name: "Dev Patel",
        phone: "+919876543218",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 4000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_precheck_1",
        customerId: customer.customerId,
        amount: 300,
        billerOrMerchant: "FASTag Toll",
        status: TransactionStatus.SUCCESS, // Already SUCCESS!
      },
    });

    const intake = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    // Step should detect target transaction is already SUCCESS and finalize immediately
    const stepResult = await orchestratorService.executeStep(intake.sessionId);

    assert(stepResult.currentState === "RESOLVED_SUCCESS", "Session should resolve immediately as SUCCESS");
    assert(stepResult.outcomeStatus === SessionOutcomeStatus.VERIFIED_SUCCESS, "Outcome should be VERIFIED_SUCCESS");
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`=== ALL ${passedTests}/${totalTests} PART 5 TESTS COMPLETED SUCCESSFULLY! ===`);
  console.log("=======================================================\n");

  await prisma.$disconnect();
}

runTests().catch(async (e) => {
  console.error("Test execution failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
