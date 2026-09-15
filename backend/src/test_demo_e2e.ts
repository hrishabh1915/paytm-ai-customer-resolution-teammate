import http from "http";
import { createApp } from "./app";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = createApp();

async function runDemoE2ETests() {
  console.log("=======================================================");
  console.log("=== STARTING PART 6: DEMO E2E INTEGRATION TESTS ===");
  console.log("=======================================================\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // TEST 1: GET /api/v1/demo/scenarios
    process.stdout.write("TEST 1: Fetch Demo Scenarios metadata ... ");
    const scenariosRes = await fetch(`${baseUrl}/api/v1/demo/scenarios`);
    const scenariosJson = (await scenariosRes.json()) as any;
    if (!scenariosJson.scenarios || scenariosJson.scenarios.length !== 3) {
      throw new Error(`Expected 3 scenarios, got ${scenariosJson.scenarios?.length}`);
    }
    console.log(" PASSED");

    // TEST 2: Scenario A - Autonomous Recovery
    process.stdout.write("TEST 2: Scenario A (Autonomous Recovery) seed and run ... ");
    const seedARes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "SCENARIO_A" }),
    });
    const seedAJson = (await seedARes.json()) as any;
    const sessionIdA = seedAJson.sessionId;
    if (!sessionIdA) throw new Error("Missing sessionId for Scenario A");

    // Run workflow
    const runARes = await fetch(`${baseUrl}/api/v1/sessions/${sessionIdA}/run`, {
      method: "POST",
    });
    const runAJson = (await runARes.json()) as any;

    if (runAJson.finalState !== "RESOLVED_SUCCESS" || runAJson.finalOutcomeStatus !== "VERIFIED_SUCCESS") {
      throw new Error(`Scenario A did not resolve to VERIFIED_SUCCESS. Status: ${runAJson.finalState}, Outcome: ${runAJson.finalOutcomeStatus}`);
    }
    console.log(" PASSED");

    // TEST 3: Scenario B - High-Value Human Review
    process.stdout.write("TEST 3: Scenario B (Human Review Required) seed, pause, approve, resolve ... ");
    const seedBRes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "SCENARIO_B" }),
    });
    const seedBJson = (await seedBRes.json()) as any;
    const sessionIdB = seedBJson.sessionId;

    // Step 1: Propose & evaluate policy -> should pause at HUMAN_REVIEW
    const stepB1Res = await fetch(`${baseUrl}/api/v1/sessions/${sessionIdB}/step`, {
      method: "POST",
    });
    const stepB1Json = (await stepB1Res.json()) as any;

    if (stepB1Json.currentState !== "HUMAN_REVIEW") {
      throw new Error(`Expected HUMAN_REVIEW, got ${stepB1Json.currentState}`);
    }

    // Fetch status to get review ID
    const statusBRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionIdB}/status`);
    const statusBJson = (await statusBRes.json()) as any;

    const pendingReview = statusBJson.humanReviews?.find((r: any) => r.status === "PENDING");
    if (!pendingReview) throw new Error("No pending human review found");

    // Submit Supervisor Approval
    const verdictRes = await fetch(`${baseUrl}/api/v1/reviews/${pendingReview.reviewId}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verdict: "APPROVED",
        reviewerNotes: "Supervisor approved high-value bill retry for VIP customer",
      }),
    });
    const verdictJson = (await verdictRes.json()) as any;

    if (verdictJson.currentState !== "RESOLVED_SUCCESS" && verdictJson.currentState !== "EVALUATING_POLICY") {
      throw new Error(`Expected currentState RESOLVED_SUCCESS or EVALUATING_POLICY after approval, got ${verdictJson.currentState}`);
    }

    // Verify session reached verified success
    const statusBAfterRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionIdB}/status`);
    const statusBAfterJson = (await statusBAfterRes.json()) as any;

    if (statusBAfterJson.outcomeStatus !== "VERIFIED_SUCCESS") {
      throw new Error(`Scenario B did not resolve to VERIFIED_SUCCESS. Status: ${statusBAfterJson.outcomeStatus}`);
    }
    console.log(" PASSED");

    // TEST 4: Scenario C - Safety Blocked (Frozen Account)
    process.stdout.write("TEST 4: Scenario C (Safety Blocked) seed and enforce guardrail ... ");
    const seedCRes = await fetch(`${baseUrl}/api/v1/demo/seed-scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "SCENARIO_C" }),
    });
    const seedCJson = (await seedCRes.json()) as any;
    const sessionIdC = seedCJson.sessionId;

    const runCRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionIdC}/run`, {
      method: "POST",
    });
    const runCJson = (await runCRes.json()) as any;

    if (runCJson.finalState !== "RESOLVED_FAILURE") {
      throw new Error(`Expected RESOLVED_FAILURE, got ${runCJson.finalState}`);
    }

    // Verify policy log was BLOCKED with RP_002
    const statusCRes = await fetch(`${baseUrl}/api/v1/sessions/${sessionIdC}/status`);
    const statusCJson = (await statusCRes.json()) as any;

    const policyLog = statusCJson.auditLogEntries.find((l: any) => l.stage === "POLICY_EVALUATED");
    if (!policyLog || policyLog.details?.verdict !== "BLOCKED" || policyLog.details?.ruleId !== "RP_002") {
      throw new Error(`Expected policy evaluation BLOCKED with RP_002. Log details: ${JSON.stringify(policyLog?.details)}`);
    }
    console.log(" PASSED");

    console.log("\n=======================================================");
    console.log("=== ALL 4/4 PART 6 DEMO E2E TESTS COMPLETED! ===");
    console.log("=======================================================\n");
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runDemoE2ETests().catch((err) => {
  console.error("\nTEST FAILED:", err);
  process.exit(1);
});
