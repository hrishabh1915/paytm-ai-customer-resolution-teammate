import http from "http";
import { createApp } from "./app";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = createApp();

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPart61AuditTests() {
  console.log("=================================================================");
  console.log("=== STARTING PART 6.1: END-TO-END DEMO & JUDGE READINESS AUDIT ===");
  console.log("=================================================================\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passedTests = 0;
  let totalTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    process.stdout.write(`AUDIT ${totalTests}: ${name} ... `);
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

  try {
    // --------------------------------------------------------------------------
    // AUDIT 1: Scenario A Full Autonomous Recovery Flow
    // --------------------------------------------------------------------------
    await test("Scenario A: Autonomous Recovery (AI -> Policy ALLOWED -> Exec -> Outcome Verified -> RESOLVED_SUCCESS)", async () => {
      const seedRes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "SCENARIO_A" }),
      });
      const seedJson = (await seedRes.json()) as any;
      const sessionId = seedJson.sessionId;
      assert(Boolean(sessionId), "Session ID must exist");

      // Run full workflow
      const runRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/run`, {
        method: "POST",
      });
      const runJson = (await runRes.json()) as any;

      assert(runJson.finalState === "RESOLVED_SUCCESS", `Expected finalState RESOLVED_SUCCESS, got ${runJson.finalState}`);
      assert(runJson.finalOutcomeStatus === "VERIFIED_SUCCESS", `Expected VERIFIED_SUCCESS, got ${runJson.finalOutcomeStatus}`);

      // Verify status endpoint returns complete authoritative data
      const statusRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/status`);
      const statusJson = (await statusRes.json()) as any;

      assert(statusJson.actionSteps.length >= 2, "Should have executed retry_payment and notification");
      assert(statusJson.actionSteps[0].policyVerdict === "ALLOWED", "Policy verdict must be ALLOWED");
      assert(statusJson.actionSteps[0].executionStatus === "SUCCESS", "Execution must be SUCCESS");
      assert(statusJson.outcomeStatus === "VERIFIED_SUCCESS", "Session outcomeStatus must be VERIFIED_SUCCESS");
      assert(statusJson.currentState === "RESOLVED_SUCCESS", "Session currentState must be RESOLVED_SUCCESS");
    });

    // --------------------------------------------------------------------------
    // AUDIT 2: Scenario B Full Human Supervisor Approval Flow
    // --------------------------------------------------------------------------
    await test("Scenario B: High-Value Human Review -> Supervisor APPROVED -> RESOLVED_SUCCESS", async () => {
      const seedRes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "SCENARIO_B" }),
      });
      const seedJson = (await seedRes.json()) as any;
      const sessionId = seedJson.sessionId;

      // Step 1: Enters HUMAN_REVIEW
      const step1Res = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/step`, { method: "POST" });
      const step1Json = (await step1Res.json()) as any;
      assert(step1Json.currentState === "HUMAN_REVIEW", `Expected HUMAN_REVIEW, got ${step1Json.currentState}`);

      // Check review
      const statusRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/status`);
      const statusJson = (await statusRes.json()) as any;
      const review = statusJson.humanReviews.find((r: any) => r.status === "PENDING");
      assert(Boolean(review), "Pending HumanReview must exist");

      // Approve review
      const verdictRes = await fetch(`${baseUrl}/api/v1/reviews/${review.reviewId}/verdict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict: "APPROVED",
          reviewerNotes: "Supervisor validated customer history and authorized payment retry",
        }),
      });
      const verdictJson = (await verdictRes.json()) as any;
      assert(verdictJson.outcomeStatus === "VERIFIED_SUCCESS", "Approval must lead to verified resolution");

      const finalStatusRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/status`);
      const finalStatusJson = (await finalStatusRes.json()) as any;
      assert(finalStatusJson.currentState === "RESOLVED_SUCCESS", "State must be RESOLVED_SUCCESS");
    });

    // --------------------------------------------------------------------------
    // AUDIT 3: Scenario B Supervisor Rejection Flow
    // --------------------------------------------------------------------------
    await test("Scenario B: Supervisor REJECTED -> Session safely terminated in RESOLVED_FAILURE", async () => {
      const seedRes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "SCENARIO_B" }),
      });
      const seedJson = (await seedRes.json()) as any;
      const sessionId = seedJson.sessionId;

      await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/step`, { method: "POST" });

      const statusRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/status`);
      const statusJson = (await statusRes.json()) as any;
      const review = statusJson.humanReviews.find((r: any) => r.status === "PENDING");

      // Reject review
      const verdictRes = await fetch(`${baseUrl}/api/v1/reviews/${review.reviewId}/verdict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict: "REJECTED",
          reviewerNotes: "Supervisor rejected retry due to suspicious repeated failure pattern",
        }),
      });
      const verdictJson = (await verdictRes.json()) as any;
      assert(verdictJson.currentState === "RESOLVED_FAILURE", "State must be RESOLVED_FAILURE");
      assert(verdictJson.outcomeStatus === "VERIFIED_FAILURE", "Outcome must be VERIFIED_FAILURE");

      // Verify zero financial tool executions occurred
      const finalStatusRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/status`);
      const finalStatusJson = (await finalStatusRes.json()) as any;
      const executedRetrySteps = finalStatusJson.actionSteps.filter((s: any) => s.toolName === "retry_payment" && s.executionStatus === "SUCCESS");
      assert(executedRetrySteps.length === 0, "No retry_payment action step should have been executed with SUCCESS");
    });

    // --------------------------------------------------------------------------
    // AUDIT 4: Scenario C Safety Block Flow (Frozen Account)
    // --------------------------------------------------------------------------
    await test("Scenario C: Safety Block (FROZEN Account -> Policy BLOCKED -> Zero Execution -> RESOLVED_FAILURE)", async () => {
      const seedRes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "SCENARIO_C" }),
      });
      const seedJson = (await seedRes.json()) as any;
      const sessionId = seedJson.sessionId;

      const runRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/run`, { method: "POST" });
      const runJson = (await runRes.json()) as any;

      assert(runJson.finalState === "RESOLVED_FAILURE", `Expected RESOLVED_FAILURE, got ${runJson.finalState}`);
      assert(runJson.finalOutcomeStatus === "VERIFIED_FAILURE", `Expected VERIFIED_FAILURE, got ${runJson.finalOutcomeStatus}`);

      const statusRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/status`);
      const statusJson = (await statusRes.json()) as any;

      assert(statusJson.customer.accountStatus === "FROZEN", "Customer must be FROZEN");
      const policyLog = statusJson.auditLogEntries.find((l: any) => l.stage === "POLICY_EVALUATED");
      assert(policyLog?.details?.verdict === "BLOCKED", "Policy verdict must be BLOCKED");
      assert(policyLog?.details?.ruleId === "RP_002", "Triggered rule must be RP_002");
    });

    // --------------------------------------------------------------------------
    // AUDIT 5: Demo Scenario Seed Isolation & Determinism
    // --------------------------------------------------------------------------
    await test("Demo Scenario Seed Isolation: Multiple seed calls create clean, isolated synthetic sessions", async () => {
      const seed1 = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "SCENARIO_A" }),
      });
      const s1Json = (await seed1.json()) as any;

      const seed2 = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "SCENARIO_A" }),
      });
      const s2Json = (await seed2.json()) as any;

      assert(s1Json.sessionId !== s2Json.sessionId, "Session IDs must be unique");
      assert(s1Json.customer.customerId !== s2Json.customer.customerId, "Customer IDs must be unique");
      assert(s1Json.transaction.transactionId !== s2Json.transaction.transactionId, "Transaction IDs must be unique");
    });

    // --------------------------------------------------------------------------
    // AUDIT 6: Audit Trail Integrity & Fact-Based Logging
    // --------------------------------------------------------------------------
    await test("Audit Trail Integrity: All lifecycle stages logged with facts; zero CoT or secrets", async () => {
      const seedRes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "SCENARIO_A" }),
      });
      const seedJson = (await seedRes.json()) as any;
      const sessionId = seedJson.sessionId;

      await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/run`, { method: "POST" });

      const statusRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/status`);
      const statusJson = (await statusRes.json()) as any;

      const stages = statusJson.auditLogEntries.map((l: any) => l.stage);
      assert(stages.includes("INTAKE"), "Must log INTAKE");
      assert(stages.includes("PLAN_PROPOSED"), "Must log PLAN_PROPOSED");
      assert(stages.includes("POLICY_EVALUATED"), "Must log POLICY_EVALUATED");
      assert(stages.includes("TOOL_EXECUTED"), "Must log TOOL_EXECUTED");
      assert(stages.includes("OUTCOME_VERIFIED"), "Must log OUTCOME_VERIFIED");
      assert(stages.includes("STATE_TRANSITION"), "Must log STATE_TRANSITION");

      // Verify no sensitive keys leaked in log details
      const stringifiedLogs = JSON.stringify(statusJson.auditLogEntries);
      assert(!stringifiedLogs.includes("AI_THINKING"), "Must not leak internal AI CoT");
      assert(!stringifiedLogs.includes("API_KEY"), "Must not leak API keys");
    });

    console.log("\n=================================================================");
    console.log(`=== ALL ${passedTests}/${totalTests} PART 6.1 AUDIT TESTS COMPLETED SUCCESSFULLY! ===`);
    console.log("=================================================================\n");
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runPart61AuditTests().catch((err) => {
  console.error("\nAUDIT TEST FAILED:", err);
  process.exit(1);
});
