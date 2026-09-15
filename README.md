# Paytm AI Customer Resolution Teammate

> **Track 3**: Autonomous AI Teammates  
> **Core Thesis**: *“Most AI agents are evaluated on whether they produce a response. We evaluate ours on whether it achieves a verified outcome.”*

---

## 📌 Executive Summary

When a digital payment or bill payment fails at the bank, traditional AI chatbots can only generate passive text advice like *"Please wait 3-5 business days"*. They cannot safely investigate, remediate, or resolve the issue.

The **Paytm AI Customer Resolution Teammate** is a bounded autonomous agentic system that takes end-to-end responsibility for resolving customer transaction disputes. It operates under a strict four-stage control plane:

$$\mathbf{AI\ Proposes} \;\longrightarrow\; \mathbf{Policy\ Decides} \;\longrightarrow\; \mathbf{System\ Acts} \;\longrightarrow\; \mathbf{Outcome\ Verifies}$$

```
+-----------------------------------------------------------------------------------+
|                                RESOLUTION SESSION                                 |
|                                                                                   |
|   +-------------------+      +--------------------+      +--------------------+   |
|   |  Customer Issue   | ---> |   Context Loader   | ---> |     AI Planner     |   |
|   |  (Intake Record)  |      |  (PostgreSQL DB)   |      |  (Gemini / Model)  |   |
|   +-------------------+      +--------------------+      +--------------------+   |
|                                                                    |              |
|                                                                    v              |
|   +---------------------------------------------------------------------------+   |
|   |                     DETERMINISTIC POLICY ENGINE                           |   |
|   |           Evaluates rules: RP_001, RP_002, RP_003, RP_004, RP_006         |   |
|   +---------------------------------------------------------------------------+   |
|            |                                              |                       |
|       [ ALLOWED ]                                  [ REQUIRES_HUMAN ]             |
|            |                                              |                       |
|            v                                              v                       |
|   +-------------------+                          +--------------------+           |
|   |   Tool Executor   |                          | Human Review Queue |           |
|   | (Idempotency Key) |                          | (Supervisor Gate)  |           |
|   +-------------------+                          +--------------------+           |
|            |                                              |                       |
|            v                                     [ APPROVE / MODIFY ]             |
|   +-------------------+                                   |                       |
|   | Synthetic Gateway | <---------------------------------+                       |
|   +-------------------+                                                           |
|            |                                                                      |
|            v                                                                      |
|   +---------------------------------------------------------------------------+   |
|   |                      INDEPENDENT OUTCOME VERIFIER                         |   |
|   |             Queries PostgreSQL ground truth for settlement ACK            |   |
|   +---------------------------------------------------------------------------+   |
|            |                                                                      |
|            v                                                                      |
|   +---------------------------------------------------------------------------+   |
|   |                     IMMUTABLE FACT AUDIT TIMELINE                         |   |
|   |           audit_log_entries (Stages, Decisions, Latencies, Rules)         |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 🏛️ Core Architectural Invariants

| Layer | Component | Authority & Responsibility | Safety Invariant |
| :--- | :--- | :--- | :--- |
| **1. Reason** | **AI Planner** | Analyzes customer dispute and history; proposes structured candidate action (`PlannerOutput`). | **Zero direct execution rights.** Cannot mutate DB or self-authorize actions. Model confidence is *informational only*. |
| **2. Authorize** | **Policy Engine** | Functional deterministic rule engine (`RP_001`–`RP_006`) enforcing mathematical guardrails. | **Deterministic boundary.** $P=1.0$ blocking on frozen accounts (`RP_002`) and threshold gating for payments $> ₹2,000$ (`RP_006`). |
| **3. Execute** | **Tool Executor** | Application runtime executing approved tools against synthetic services. | **Cryptographic Idempotency.** Every mutating step carries `idemp_<stepId>` to prevent double-debits. |
| **4. Verify** | **Outcome Verifier** | Queries PostgreSQL ground truth for biller settlement ACK. | **Independent verification.** AI cannot self-declare success; only PostgreSQL settlement state marks resolution. |

---

## 🎬 1-Click Judge Demo Scenarios

| Scenario | Customer & Context | Triggered Rule | Flow & Verdict | Expected Final State |
| :--- | :--- | :--- | :--- | :--- |
| **Scenario A**<br>*(Autonomous Recovery)* | Aarav Sharma<br>₹1,250 Tata Power bill<br>`FAILED_AT_BANK` | `RP_001` (Active/Valid) | AI Proposes `retry_payment` $\to$ Policy `ALLOWED` $\to$ Tool Exec $\to$ OutcomeVerifier `VERIFIED_SUCCESS` $\to$ SMS Notify | `RESOLVED_SUCCESS`<br>`VERIFIED_SUCCESS`<br>Simulated: ₹1,250 |
| **Scenario B**<br>*(Human Review Flow)* | Pooja Patel<br>₹3,500 Adani Electricity<br>Threshold > ₹2,000 | `RP_006` (High-Value) | AI Proposes `retry_payment` $\to$ Policy `REQUIRES_HUMAN` $\to$ Supervisor Approves $\to$ Policy Re-evaluates $\to$ Tool Exec $\to$ OutcomeVerifier | `RESOLVED_SUCCESS`<br>`VERIFIED_SUCCESS`<br>Simulated: ₹3,500 |
| **Scenario C**<br>*(Safety Guardrail)* | Neha Gupta<br>₹500 BESCOM bill<br>Account `FROZEN` | `RP_002` (Account Inactive) | AI Proposes `retry_payment` $\to$ Policy `BLOCKED` $\to$ Zero Tool Execution $\to$ Safe Termination | `RESOLVED_FAILURE`<br>`VERIFIED_FAILURE`<br>Simulated: ₹0 |

---

## 💻 Tech Stack

- **Backend**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL.
- **Frontend**: React 19, TypeScript, Vite, Vanilla CSS Design System, Lucide Icons.
- **AI Planning**: Google Gemini (`gemini-2.5-flash`) via structured JSON schema output + Built-in deterministic offline simulation fallback.
- **Validation**: Zod runtime schema validation.
- **Testing**: Native TypeScript integration test suites (32 automated tests).

---

## 🚀 Quick Start & Local Setup

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL instance running on `localhost:5432`

### 2. Configure Environment Variables
```bash
# Backend environment setup
cp backend/.env.example backend/.env

# Update DATABASE_URL in backend/.env:
# DATABASE_URL="postgresql://username:password@localhost:5432/paytm_ai_teammate?schema=public"

# Optional: Add Google Gemini API key (or leave empty to use built-in offline simulation)
# GEMINI_API_KEY="your_api_key_here"
```

### 3. Install Dependencies & Migrate Database
```bash
# Install backend dependencies & generate Prisma client
cd backend
npm install
npx prisma db push

# Install frontend dependencies
cd ../frontend
npm install
```

### 4. Run Automated Test Suite
```bash
# Run all 32 automated tests
cd backend
npx tsx src/test_part5.ts
npx tsx src/test_part5_1_audit.ts
npx tsx src/test_demo_e2e.ts
npx tsx src/test_part6_1_audit.ts
npx tsx src/test_live_servers.ts
```

### 5. Launch Development Servers
```bash
# Terminal 1: Start Backend (Port 4000)
cd backend
npm run dev

# Terminal 2: Start Frontend Control Room (Port 5173)
cd frontend
npm run dev
```

Open **`http://localhost:5173`** in your browser to interact with the Control Room.

---

## 🤖 AI Provider & Offline Fallback Transparency

- **Live Mode**: When `GEMINI_API_KEY` is configured in `backend/.env`, the system invokes Google Gemini (`gemini-2.5-flash`) with structured output enforcement.
- **Offline Fallback**: When `GEMINI_API_KEY` is empty, the system automatically uses an intelligent, context-grounded reasoning simulation engine for 100% reproducible offline evaluation.
- **UI Transparency**: The Control Room header displays `LIVE: <model_name>` when connected to Gemini and `OFFLINE DEMO FALLBACK` when running standalone.

---

## ⚠️ Synthetic Demo Data Disclaimer

> **IMPORTANT**: This prototype uses synthetic mock customer records, mock wallet balances, and simulated downstream payment gateways within a local PostgreSQL database for demonstration purposes. It is **not** connected to Paytm's production financial switch or live banking networks. All revenue figures are strictly **Simulated Amount Recovered**.

---

## 📚 Technical Documentation

- **[Architecture Specification](docs/ARCHITECTURE.md)**: Deep dive into the four-stage control plane, boundary enforcement, and idempotency protocol.
- **[Judge Q&A Defense Guide](docs/JUDGE_QA.md)**: Authoritative answers to 20 top hackathon evaluation questions.
- **[3-Minute Demo Script](docs/DEMO_SCRIPT.md)**: Step-by-step presentation script with click actions and narration.
- **[30-Second Elevator Pitch](docs/PITCH.md)**: High-impact summary of the problem, solution, and differentiator.
