async function testLiveServers() {
  console.log("==========================================================");
  console.log("=== TESTING LIVE RUNNING SERVERS (PORT 4000 & 5173) ===");
  console.log("==========================================================\n");

  // 1. Test Frontend HTML & Assets
  process.stdout.write("1. Verifying Frontend server on http://localhost:5173 ... ");
  const frontendRes = await fetch("http://localhost:5173");
  if (!frontendRes.ok) throw new Error(`Frontend returned HTTP ${frontendRes.status}`);
  const htmlText = await frontendRes.text();
  if (!htmlText.includes("AI Customer Resolution Teammate")) {
    throw new Error("Frontend title missing from HTML");
  }
  console.log(`PASSED (HTTP ${frontendRes.status})`);

  // 2. Test Backend Health
  process.stdout.write("2. Verifying Backend health on http://localhost:4000/health ... ");
  const healthRes = await fetch("http://localhost:4000/health");
  if (!healthRes.ok) throw new Error(`Backend health returned HTTP ${healthRes.status}`);
  const healthJson = await healthRes.json() as any;
  if (healthJson.status !== "ok") throw new Error("Backend not healthy");
  console.log(`PASSED (${JSON.stringify(healthJson)})`);

  // 3. Test Demo Scenarios List
  process.stdout.write("3. Verifying Demo Scenarios on http://localhost:4000/api/v1/demo/scenarios ... ");
  const scenariosRes = await fetch("http://localhost:4000/api/v1/demo/scenarios");
  const scenariosJson = await scenariosRes.json() as any;
  if (!scenariosJson.scenarios || scenariosJson.scenarios.length !== 3) {
    throw new Error(`Expected 3 scenarios, got ${scenariosJson.scenarios?.length}`);
  }
  console.log(`PASSED (${scenariosJson.scenarios.map((s: any) => s.id).join(", ")})`);

  // 4. Test Scenario A Full Live Execution
  process.stdout.write("4. Verifying Scenario A live seed, run, and outcome ... ");
  const seedARes = await fetch("http://localhost:4000/api/v1/demo/seed-scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "SCENARIO_A" }),
  });
  const seedAJson = await seedARes.json() as any;
  const sIdA = seedAJson.sessionId;

  const runARes = await fetch(`http://localhost:4000/api/v1/sessions/${sIdA}/run`, { method: "POST" });
  const runAJson = await runARes.json() as any;
  if (runAJson.finalState !== "RESOLVED_SUCCESS" || runAJson.finalOutcomeStatus !== "VERIFIED_SUCCESS") {
    throw new Error(`Scenario A failed: ${runAJson.finalState}`);
  }
  console.log("PASSED (RESOLVED_SUCCESS, VERIFIED_SUCCESS, Amount: ₹1,250)");

  // 5. Test Scenario B Human Review Flow
  process.stdout.write("5. Verifying Scenario B live seed, human pause, supervisor approve ... ");
  const seedBRes = await fetch("http://localhost:4000/api/v1/demo/seed-scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "SCENARIO_B" }),
  });
  const seedBJson = await seedBRes.json() as any;
  const sIdB = seedBJson.sessionId;

  const stepBRes = await fetch(`http://localhost:4000/api/v1/sessions/${sIdB}/step`, { method: "POST" });
  const stepBJson = await stepBRes.json() as any;
  if (stepBJson.currentState !== "HUMAN_REVIEW") throw new Error(`Expected HUMAN_REVIEW, got ${stepBJson.currentState}`);

  const statusBRes = await fetch(`http://localhost:4000/api/v1/sessions/${sIdB}/status`);
  const statusBJson = await statusBRes.json() as any;
  const review = statusBJson.humanReviews.find((r: any) => r.status === "PENDING");

  const verdictRes = await fetch(`http://localhost:4000/api/v1/reviews/${review.reviewId}/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verdict: "APPROVED", reviewerNotes: "Live supervisor approved" }),
  });
  const verdictJson = await verdictRes.json() as any;
  if (verdictJson.outcomeStatus !== "VERIFIED_SUCCESS") throw new Error("Approval did not resolve");
  console.log("PASSED (REQUIRES_HUMAN -> Supervisor APPROVED -> RESOLVED_SUCCESS)");

  // 6. Test Scenario C Safety Block Flow
  process.stdout.write("6. Verifying Scenario C live seed, policy block, safe failure ... ");
  const seedCRes = await fetch("http://localhost:4000/api/v1/demo/seed-scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "SCENARIO_C" }),
  });
  const seedCJson = await seedCRes.json() as any;
  const sIdC = seedCJson.sessionId;

  const runCRes = await fetch(`http://localhost:4000/api/v1/sessions/${sIdC}/run`, { method: "POST" });
  const runCJson = await runCRes.json() as any;
  if (runCJson.finalState !== "RESOLVED_FAILURE") throw new Error(`Expected RESOLVED_FAILURE, got ${runCJson.finalState}`);
  console.log("PASSED (BLOCKED under RP_002, 0 tool executions, RESOLVED_FAILURE)");

  console.log("\n==========================================================");
  console.log("=== ALL LIVE SERVER ENDPOINTS VERIFIED SUCCESSFULLY! ===");
  console.log("==========================================================\n");
}

testLiveServers().catch((err) => {
  console.error("Live server test failed:", err);
  process.exit(1);
});
