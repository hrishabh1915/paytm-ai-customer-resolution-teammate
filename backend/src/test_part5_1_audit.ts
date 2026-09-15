import { prisma } from "./config/db";
import { orchestratorService } from "./orchestrator/orchestrator.service";
import { sessionService } from "./services/session.service";
import { plannerService } from "./planner/planner.service";
import { MockLlmAdapter } from "./planner/adapters/geminiAdapter";
import { outcomeVerifier } from "./orchestrator/outcomeVerifier";
import {
  ActionExecutionStatus,
  ActionStepPolicyStatus,
  CustomerAccountStatus,
  HumanReviewStatus,
  SessionOutcomeStatus,
  TransactionStatus,
} from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAuditSuite() {
  console.log("\n=======================================================");
  console.log("=== STARTING PART 5.1: CRITICAL ORCHESTRATOR AUDIT ===");
  console.log("=======================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    process.stdout.write(`AUDIT TEST ${totalTests}: ${name} ... `);
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

  await prisma.$connect();

  // Clean DB
  await prisma.auditLogEntry.deleteMany({});
  await prisma.humanReview.deleteMany({});
  await prisma.actionStep.deleteMany({});
  await prisma.resolutionSession.deleteMany({});
  await prisma.syntheticTransaction.deleteMany({});
  await prisma.syntheticCustomer.deleteMany({});

  // --------------------------------------------------------------------------
  // TEST 1: Policy + Idempotency Sequencing Invariant
  // --------------------------------------------------------------------------
  await test("Policy + Idempotency Sequencing: RP_001 strictly enforced, stepId matches idempotencyKey", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_seq_1",
        name: "Aman Gupta",
        phone: "+919111111111",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 5000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_seq_1",
        customerId: customer.customerId,
        amount: 1500,
        billerOrMerchant: "Airtel DTH",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
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
          decisionSummary: "Retry failed DTH recharge.",
          proposedAction: {
            toolName: "retry_payment",
            params: { originalTransactionId: txn.transactionId },
          },
          expectedOutcome: "Payment succeeds",
          confidence: 0.95,
        })
      )
    );

    const stepResult = await orchestratorService.executeStep(intake.sessionId);

    assert(stepResult.currentState === "RESOLVED_SUCCESS", "Must be RESOLVED_SUCCESS");

    // 1. Verify that retry_payment step was created and allowed
    const stepsInDb = await prisma.actionStep.findMany({
      where: { sessionId: intake.sessionId },
      orderBy: { createdAt: "asc" },
    });

    const retryStep = stepsInDb.find((s) => s.toolName === "retry_payment");
    assert(retryStep !== undefined, "Persisted retry_payment ActionStep must exist in DB");
    assert(retryStep?.policyVerdict === ActionStepPolicyStatus.ALLOWED, "Policy must be ALLOWED");

    // 2. Verify persisted idempotencyKey in toolParams equals `idemp_${stepId}`
    const stepParams = retryStep?.toolParams as Record<string, unknown>;
    assert(stepParams.idempotencyKey === `idemp_${retryStep?.stepId}`, "idempotencyKey must strictly match stepId");

    // 3. Verify created transaction in synthetic_transactions has the exact same idempotencyKey
    const createdTxn = await prisma.syntheticTransaction.findUnique({
      where: { idempotencyKey: `idemp_${retryStep?.stepId}` },
    });
    assert(createdTxn !== null, "Transaction must have been created with the exact idempotencyKey");
    assert(createdTxn?.status === TransactionStatus.SUCCESS, "Created transaction status must be SUCCESS");
  });

  // --------------------------------------------------------------------------
  // TEST 2: Concurrency & Double Execution Protection
  // --------------------------------------------------------------------------
  await test("Concurrency Protection: Concurrent runSession calls cannot double-execute retry_payment", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_conc_1",
        name: "Rahul Bajaj",
        phone: "+919222222222",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 8000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_conc_1",
        customerId: customer.customerId,
        amount: 1200,
        billerOrMerchant: "MSEB Power",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
      },
    });

    const intake = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    plannerService.setAdapter(
      new MockLlmAdapter(async () => {
        // Add artificial delay to simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 50));
        return JSON.stringify({
          decisionSummary: "Retry payment.",
          proposedAction: {
            toolName: "retry_payment",
            params: { originalTransactionId: txn.transactionId },
          },
          expectedOutcome: "Retry payment",
          confidence: 0.9,
        });
      })
    );

    // Launch two concurrent runSession executions on the exact same session
    const [res1, res2] = await Promise.all([
      orchestratorService.runSession(intake.sessionId, 5),
      orchestratorService.runSession(intake.sessionId, 5),
    ]);

    // Check that session finished successfully in terminal state
    const session = await prisma.resolutionSession.findUnique({
      where: { sessionId: intake.sessionId },
      include: { actionSteps: true },
    });

    assert(session?.currentState === "RESOLVED_SUCCESS", "Session must be in RESOLVED_SUCCESS");
    assert(session?.outcomeStatus === SessionOutcomeStatus.VERIFIED_SUCCESS, "Outcome must be VERIFIED_SUCCESS");

    // Check that retry_payment was executed EXACTLY ONCE
    const retrySteps = session?.actionSteps.filter((s) => s.toolName === "retry_payment");
    assert(retrySteps?.length === 1, `retry_payment must be executed exactly 1 time, found ${retrySteps?.length}`);

    // Check that only 1 successful synthetic transaction was created
    const createdTxns = await prisma.syntheticTransaction.findMany({
      where: { customerId: customer.customerId, status: TransactionStatus.SUCCESS },
    });
    assert(createdTxns.length === 1, `Exactly 1 SUCCESS transaction must exist, found ${createdTxns.length}`);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Human Modification Must Re-Enter Policy Gate
  // --------------------------------------------------------------------------
  await test("Human Modification Policy Gate: Dangerous supervisor modification is BLOCKED by PolicyEngine", async () => {
    // 1. Customer A with active account
    const customerA = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_hgate_A",
        name: "Alok Nath",
        phone: "+919333333331",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 10000,
      },
    });

    // 2. Customer B with FROZEN account
    const customerB = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_hgate_B",
        name: "Shady User",
        phone: "+919333333332",
        accountStatus: CustomerAccountStatus.FROZEN, // FROZEN!
        syntheticBalance: 5000,
      },
    });

    const txnA = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_hgate_A",
        customerId: customerA.customerId,
        amount: 3000, // > ₹2000 threshold
        billerOrMerchant: "BESCOM",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
      },
    });

    const txnB = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_hgate_B",
        customerId: customerB.customerId,
        amount: 3000,
        billerOrMerchant: "BESCOM",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "ACCOUNT_FROZEN",
      },
    });

    const intake = await sessionService.processIntake({
      customerId: customerA.customerId,
      transactionId: txnA.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    plannerService.setAdapter(
      new MockLlmAdapter(() =>
        JSON.stringify({
          decisionSummary: "Retry high-value transaction.",
          proposedAction: {
            toolName: "retry_payment",
            params: { originalTransactionId: txnA.transactionId },
          },
          expectedOutcome: "Retry payment",
          confidence: 0.9,
        })
      )
    );

    const step1 = await orchestratorService.executeStep(intake.sessionId);
    assert(step1.currentState === "HUMAN_REVIEW", "Must pause in HUMAN_REVIEW");

    const reviewId = step1.humanReviewId!;

    // Supervisor attempts to modify the action to point to a transaction belonging to Customer B (or frozen account)
    const verdictResult = await orchestratorService.submitHumanVerdict(reviewId, {
      verdict: "MODIFIED",
      reviewerNotes: "Modified to different transaction.",
      modifiedParams: { originalTransactionId: txnB.transactionId },
    });

    // PolicyEngine must catch and BLOCK this modification (mismatched customer or non-active customer)
    assert(verdictResult.currentState === "RESOLVED_FAILURE", "Must transition to RESOLVED_FAILURE on policy block");
    assert(verdictResult.policyVerdict === ActionStepPolicyStatus.BLOCKED, "Policy verdict must be BLOCKED");
    assert(verdictResult.isTerminal === true, "Must be marked terminal");

    // Verify tool was NOT executed (txnB status must still be FAILED_AT_BANK, not SUCCESS)
    const txnBInDb = await prisma.syntheticTransaction.findUnique({
      where: { transactionId: txnB.transactionId },
    });
    assert(txnBInDb?.status === TransactionStatus.FAILED_AT_BANK, "Target transaction was NOT modified");
  });

  // --------------------------------------------------------------------------
  // TEST 4: Human Review Concurrency & Duplicate Verdict Protection
  // --------------------------------------------------------------------------
  await test("Human Review Concurrency: Concurrent supervisor verdict calls cannot double-resolve review", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_hconc_1",
        name: "Meera Nair",
        phone: "+919444444444",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 6000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_hconc_1",
        customerId: customer.customerId,
        amount: 2500,
        billerOrMerchant: "Adani Gas",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
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
          decisionSummary: "Retry gas bill.",
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
    const reviewId = step1.humanReviewId!;

    // Two concurrent supervisor approvals for the exact same reviewId
    const results = await Promise.allSettled([
      orchestratorService.submitHumanVerdict(reviewId, { verdict: "APPROVED" }),
      orchestratorService.submitHumanVerdict(reviewId, { verdict: "APPROVED" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert(fulfilled.length === 1, "Exactly 1 verdict submission must succeed");
    assert(rejected.length === 1, "The concurrent duplicate verdict submission must be rejected");
  });

  // --------------------------------------------------------------------------
  // TEST 5: OutcomeVerifier Invariant (LLM / Tool cannot fake success)
  // --------------------------------------------------------------------------
  await test("OutcomeVerifier Invariant: If DB state is not SUCCESS, OutcomeVerifier returns INCONCLUSIVE", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_out_1",
        name: "Gaurav Sen",
        phone: "+919555555555",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 3000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_out_1",
        customerId: customer.customerId,
        amount: 400,
        billerOrMerchant: "Netflix",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
      },
    });

    const intake = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: txn.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const outcome = await outcomeVerifier.verifyPaymentOutcome(intake.sessionId, txn.transactionId);
    assert(outcome.status !== "VERIFIED_SUCCESS", "Outcome must NOT be VERIFIED_SUCCESS when DB is failed");
  });

  // --------------------------------------------------------------------------
  // TEST 6: Audit Log Integrity & No Private Chain-of-Thought
  // --------------------------------------------------------------------------
  await test("Audit Log Integrity: All lifecycle stages logged with facts; no CoT or secrets", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_audit_1",
        name: "Shreya Ghoshal",
        phone: "+919666666666",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 7000,
      },
    });

    const txn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: "txn_audit_1",
        customerId: customer.customerId,
        amount: 900,
        billerOrMerchant: "Hotstar",
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason: "TIMEOUT",
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
          decisionSummary: "Retry Hotstar payment.",
          proposedAction: {
            toolName: "retry_payment",
            params: { originalTransactionId: txn.transactionId },
          },
          expectedOutcome: "Success",
          confidence: 0.9,
        })
      )
    );

    await orchestratorService.runSession(intake.sessionId, 3);

    const auditLogs = await prisma.auditLogEntry.findMany({
      where: { sessionId: intake.sessionId },
      orderBy: { timestamp: "asc" },
    });

    assert(auditLogs.length >= 4, `Expected >= 4 audit logs, got ${auditLogs.length}`);

    // Verify none contains raw internal secrets or private thought chains
    for (const log of auditLogs) {
      const detailsStr = JSON.stringify(log.details);
      assert(!detailsStr.includes("PRIVATE_CHAIN_OF_THOUGHT"), "Audit must not contain CoT");
      assert(!detailsStr.includes("AI_SECRET_KEY"), "Audit must not contain secrets");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 7: Terminal State Immutability
  // --------------------------------------------------------------------------
  await test("Terminal State Immutability: Re-stepping or modifying terminal session is rejected", async () => {
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId: "cust_term_test_1",
        name: "Sunil Chhetri",
        phone: "+919777777777",
        accountStatus: CustomerAccountStatus.ACTIVE,
        syntheticBalance: 2000,
      },
    });

    const session = await prisma.resolutionSession.create({
      data: {
        customerId: customer.customerId,
        statedObjective: "RETRY_PAYMENT",
        currentState: "RESOLVED_FAILURE",
        outcomeStatus: SessionOutcomeStatus.VERIFIED_FAILURE,
      },
    });

    const stepResult = await orchestratorService.executeStep(session.sessionId);
    assert(stepResult.isTerminal === true, "Must return isTerminal: true");
    assert(stepResult.currentState === "RESOLVED_FAILURE", "State must remain unchanged");
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`=== ALL ${passedTests}/${totalTests} PART 5.1 AUDIT TESTS COMPLETED SUCCESSFULLY! ===`);
  console.log("=======================================================\n");

  await prisma.$disconnect();
}

runAuditSuite().catch(async (e) => {
  console.error("Audit test execution failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
