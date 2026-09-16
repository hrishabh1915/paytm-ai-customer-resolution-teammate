import type {
  DemoScenario,
  SeedScenarioResponse,
  SessionStatusResponse,
  StepExecutionResult,
  RunSessionResult,
} from "../types/api";

const PROD_BACKEND_URL = "https://paytm-ai-customer-resolution-teammate.onrender.com/api/v1";
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? PROD_BACKEND_URL
    : "http://localhost:4000/api/v1");

export async function fetchDemoScenarios(): Promise<{ scenarios: DemoScenario[] }> {
  const res = await fetch(`${API_BASE}/demo/scenarios`);
  if (!res.ok) {
    throw new Error(`Failed to fetch demo scenarios: ${res.statusText}`);
  }
  return res.json();
}

export async function seedDemoScenario(
  scenario: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C"
): Promise<SeedScenarioResponse> {
  const res = await fetch(`${API_BASE}/demo/seed-scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to seed scenario: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch session: ${res.statusText}`);
  }
  return res.json();
}

export async function executeStep(sessionId: string): Promise<StepExecutionResult> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to execute step: ${res.statusText}`);
  }
  return res.json();
}

export async function runWorkflow(
  sessionId: string,
  maxSteps: number = 10
): Promise<RunSessionResult> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxSteps }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to run workflow: ${res.statusText}`);
  }
  return res.json();
}

export async function submitHumanVerdict(
  reviewId: string,
  verdict: "APPROVED" | "REJECTED" | "MODIFIED",
  reviewerNotes?: string,
  modifiedParams?: Record<string, unknown>
): Promise<StepExecutionResult> {
  const res = await fetch(`${API_BASE}/reviews/${reviewId}/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      verdict,
      reviewerNotes,
      modifiedParams,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to submit verdict: ${res.statusText}`);
  }
  return res.json();
}
