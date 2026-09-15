# 3-Minute Hackathon Demo Script

**Project**: Paytm AI Customer Resolution Teammate  
**Theme**: Track 3 — Autonomous AI Teammates  
**Core Thesis**: *AI Proposes $\to$ Policy Decides $\to$ System Acts $\to$ Outcome Verifies*

---

## ⏱️ Timeline Overview

| Timestamp | Phase | Key Action / Screen |
| :--- | :--- | :--- |
| **00:00 – 00:20** | Problem Statement | Show Control Room Header & Thesis banner |
| **00:20 – 00:40** | Architecture Overview | Walk through the 4-column dashboard layout |
| **00:40 – 01:25** | Scenario A: Autonomous Recovery | Click **Scenario A** $\to$ **Run Workflow** $\to$ Verified Success |
| **01:25 – 02:05** | Scenario B: Human-in-the-Loop | Click **Scenario B** $\to$ **Step** $\to$ Supervisor Approve $\to$ Resolve |
| **02:05 – 02:35** | Scenario C: Safety Guardrail | Click **Scenario C** $\to$ **Run Workflow** $\to$ Blocked by Policy |
| **02:35 – 03:00** | Audit Trail & Q&A Wrap | Scroll to Audit Timeline $\to$ Highlight immutable facts |

---

## 🎬 Detailed Step-by-Step Script

### [00:00 – 00:20] Hook & Problem Statement
- **Presenter says**: 
  > *"When a digital payment fails, customer support chatbots are useless because they only generate text responses. They cannot safely investigate or fix the transaction. We built an outcome-driven AI teammate that takes end-to-end responsibility for dispute resolution."*
- **Visual**: Point to the top banner: **AI Proposes $\to$ Policy Decides $\to$ System Acts $\to$ Outcome Verifies**.

---

### [00:20 – 00:40] Architecture Overview
- **Presenter says**:
  > *"The critical invariant of our architecture is that the AI never touches payment APIs directly. The LLM is a probabilistic reasoning planner. The Deterministic Policy Engine is the authorization gate. The system executes approved tools with idempotency keys, and an independent Outcome Verifier checks ground truth in PostgreSQL before marking business success."*
- **Visual**: Point out the 4 columns: **Case Context**, **AI Planner**, **Policy Engine**, **Execution & Outcome Verifier**.

---

### [00:40 – 01:25] Scenario A — Autonomous Recovery
- **Action**: Click **Scenario A (Autonomous Recovery)** in the top bar, then click **Run Workflow**.
- **What Happens**:
  1. Intake loads ₹1,250 Tata Power failed electricity bill for Aarav Sharma.
  2. AI Planner formulates proposal: `retry_payment`.
  3. Policy Engine evaluates rule `RP_001` and issues `ALLOWED`.
  4. Tool Executor dispatches `retry_payment` with generated `idemp_<stepId>`.
  5. OutcomeVerifier checks PostgreSQL and confirms new transaction status is `SUCCESS`.
  6. AI sends SMS confirmation to customer.
  7. State transitions to `RESOLVED_SUCCESS` with `VERIFIED_SUCCESS` outcome.
- **Presenter says**:
  > *"Notice what happened: the AI proposed the retry, the Policy Engine authorized it under rule RP_001, the system executed the retry idempotently, and the Outcome Verifier confirmed the transaction settled in the database. Simulated revenue recovered: ₹1,250."*

---

### [01:25 – 02:05] Scenario B — Human Supervisor Approval
- **Action**: Click **Scenario B (Human Review Required)**, then click **Step Workflow (1 Step)**.
- **What Happens**:
  1. Intake loads ₹3,500 Adani Electricity payment for Pooja Patel.
  2. AI Planner proposes `retry_payment`.
  3. Policy Engine detects the amount exceeds the ₹2,000 autonomous threshold and triggers rule `RP_006` $\to$ `REQUIRES_HUMAN`.
  4. The UI displays the amber **Human Supervisor Review Required** card.
- **Presenter says**:
  > *"Because this payment is ₹3,500, Policy Engine refuses autonomous execution. Even if the AI had 100% confidence, confidence is not authorization."*
- **Action**: In the review card, enter note *"Approved for VIP customer"* and click **Approve Action**.
- **What Happens**:
  1. Backend reloads authoritative state, runs a fresh Policy Engine evaluation, executes the payment, verifies the outcome, and marks `RESOLVED_SUCCESS`.
- **Presenter says**:
  > *"The supervisor approved, the policy engine re-validated the action, and the outcome verifier proved completion."*

---

### [02:05 – 02:35] Scenario C — Deterministic Safety Guardrail
- **Action**: Click **Scenario C (Deterministic Safety Block)**, then click **Run Workflow**.
- **What Happens**:
  1. Intake loads a dispute for Neha Gupta, whose account status is `FROZEN`.
  2. AI Planner proposes `retry_payment`.
  3. Policy Engine triggers rule `RP_002` (Account Inactive/Frozen) $\to$ `BLOCKED`.
  4. Zero mutating tools execute.
  5. Session transitions safely to `RESOLVED_FAILURE` (`VERIFIED_FAILURE`).
- **Presenter says**:
  > *"In Scenario C, the customer's account is frozen. The AI proposed a retry, but the Policy Engine deterministically blocked execution. Mutating tool executions equals zero. The system fails safely without hallucinated financial damage."*

---

### [02:35 – 03:00] Audit Trail & Wrap-up
- **Action**: Scroll down to the **Live Immutable Audit Timeline**.
- **Presenter says**:
  > *"Every single decision—intake, reasoning summary, deterministic policy rule, idempotency key, and PostgreSQL outcome assertion—is recorded in an immutable audit trail with zero private chain-of-thought leaked. This is how you build production-defensible AI teammates for financial systems."*
- **Visual**: Highlight the structured audit timeline with timestamps and stage badges.
