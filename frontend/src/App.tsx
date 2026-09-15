import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { WorkflowPipeline } from "./components/WorkflowPipeline";
import { CasePanel } from "./components/CasePanel";
import { AiPlannerPanel } from "./components/AiPlannerPanel";
import { PolicyEnginePanel } from "./components/PolicyEnginePanel";
import { ExecutionAndOutcomePanel } from "./components/ExecutionAndOutcomePanel";
import { HumanReviewModal } from "./components/HumanReviewModal";
import { AuditTimeline } from "./components/AuditTimeline";
import { MetricsStrip } from "./components/MetricsStrip";
import {
  fetchDemoScenarios,
  seedDemoScenario,
  fetchSessionStatus,
  executeStep,
  runWorkflow,
  submitHumanVerdict,
} from "./services/api";
import type {
  DemoScenario,
  SessionStatusResponse,
  HumanReviewData,
} from "./types/api";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export const App: React.FC = () => {
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<
    "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C"
  >("SCENARIO_A");
  const [currentSession, setCurrentSession] = useState<SessionStatusResponse | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isStepping, setIsStepping] = useState<boolean>(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Load scenarios on mount and restore prior session or seed initial Scenario A
  useEffect(() => {
    fetchDemoScenarios()
      .then(async (res) => {
        setScenarios(res.scenarios);
        const savedSessionId = localStorage.getItem("paytm_demo_sessionId");
        const savedScenarioId = localStorage.getItem("paytm_demo_scenarioId") as
          | "SCENARIO_A"
          | "SCENARIO_B"
          | "SCENARIO_C"
          | null;

        if (savedSessionId) {
          try {
            setSessionId(savedSessionId);
            if (savedScenarioId) setActiveScenarioId(savedScenarioId);
            await refreshSession(savedSessionId);
            return;
          } catch {
            // fallback to new seed if saved session invalid
          }
        }
        
        if (res.scenarios.length > 0) {
          handleSelectScenario("SCENARIO_A");
        }
      })
      .catch((err) => {
        setErrorMessage(`Backend connection error: ${err.message}. Is the backend running on port 4000?`);
      });
  }, []);

  // Poll/refresh session status
  const refreshSession = useCallback(async (sId: string) => {
    if (!sId) return;
    try {
      const data = await fetchSessionStatus(sId);
      setCurrentSession(data);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to refresh session status.");
    }
  }, []);

  // Handle Scenario Selection & Seeding
  const handleSelectScenario = async (
    scenarioId: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C"
  ) => {
    setActiveScenarioId(scenarioId);
    setErrorMessage(null);
    setInfoMessage(`Seeding synthetic context for ${scenarioId}...`);
    try {
      const seedRes = await seedDemoScenario(scenarioId);
      setSessionId(seedRes.sessionId);
      localStorage.setItem("paytm_demo_sessionId", seedRes.sessionId);
      localStorage.setItem("paytm_demo_scenarioId", scenarioId);
      await refreshSession(seedRes.sessionId);
      setInfoMessage(`Loaded ${scenarioId}: ${seedRes.statedObjective}`);
      setTimeout(() => setInfoMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to seed demo scenario.");
    }
  };

  // Run full workflow
  const handleRunWorkflow = async () => {
    if (!sessionId || isRunning) return;
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const runResult = await runWorkflow(sessionId, 10);
      await refreshSession(sessionId);
      setInfoMessage(`Workflow executed: ${runResult.message}`);
      setTimeout(() => setInfoMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to run workflow.");
    } finally {
      setIsRunning(false);
    }
  };

  // Execute single step
  const handleStepWorkflow = async () => {
    if (!sessionId || isStepping) return;
    setIsStepping(true);
    setErrorMessage(null);
    try {
      const stepResult = await executeStep(sessionId);
      await refreshSession(sessionId);
      setInfoMessage(`Step executed: ${stepResult.message}`);
      setTimeout(() => setInfoMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to step workflow.");
    } finally {
      setIsStepping(false);
    }
  };

  // Submit human supervisor review verdict
  const handleSubmitVerdict = async (
    reviewId: string,
    verdict: "APPROVED" | "REJECTED" | "MODIFIED",
    notes?: string,
    modifiedParams?: Record<string, unknown>
  ) => {
    setIsSubmittingReview(true);
    setErrorMessage(null);
    try {
      const result = await submitHumanVerdict(reviewId, verdict, notes, modifiedParams);
      await refreshSession(sessionId);
      setInfoMessage(`Verdict '${verdict}' submitted: ${result.message}`);
      setTimeout(() => setInfoMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit supervisor verdict.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Check for pending human review
  const pendingReview: HumanReviewData | null =
    currentSession?.humanReviews?.find((r) => r.status === "PENDING") || null;

  return (
    <div className="control-room-container">
      {/* Header with Thesis, Badges, Scenario Selector, and Execution Controls */}
      <Header
        sessionId={sessionId}
        statedObjective={currentSession?.statedObjective}
        currentState={currentSession?.currentState}
        scenarios={scenarios}
        activeScenarioId={activeScenarioId}
        onSelectScenario={handleSelectScenario}
        onRunWorkflow={handleRunWorkflow}
        onStepWorkflow={handleStepWorkflow}
        onRefresh={() => refreshSession(sessionId)}
        isRunning={isRunning}
        isStepping={isStepping}
      />

      {/* Alert / Notification Banners */}
      {errorMessage && (
        <div className="callout-box red" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={16} color="var(--accent-red)" />
          <span>{errorMessage}</span>
        </div>
      )}

      {infoMessage && (
        <div className="callout-box cyan" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} color="var(--paytm-cyan)" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* Visual State Machine Workflow Pipeline */}
      <WorkflowPipeline
        currentState={currentSession?.currentState}
        outcomeStatus={currentSession?.outcomeStatus}
      />

      {/* Human Review Modal (Prominently pauses UI on HUMAN_REVIEW) */}
      {currentSession?.currentState === "HUMAN_REVIEW" && pendingReview && (
        <HumanReviewModal
          pendingReview={pendingReview}
          onSubmitVerdict={handleSubmitVerdict}
          isSubmitting={isSubmittingReview}
        />
      )}

      {/* Core 4-Column Control Room Dashboard */}
      <div className="dashboard-grid">
        {/* 1. Case & Customer Context */}
        <CasePanel session={currentSession} />

        {/* 2. AI Planner (Proposes) */}
        <AiPlannerPanel session={currentSession} />

        {/* 3. Deterministic Policy Engine (Decides) */}
        <PolicyEnginePanel session={currentSession} />

        {/* 4. Action Execution & Outcome Verifier (Acts & Verifies) */}
        <ExecutionAndOutcomePanel session={currentSession} />
      </div>

      {/* Session Metrics Strip */}
      <MetricsStrip session={currentSession} />

      {/* Live Immutable Audit Timeline */}
      <AuditTimeline logs={currentSession?.auditLogEntries || []} />
    </div>
  );
};

export default App;
