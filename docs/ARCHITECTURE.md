# Technical Architecture — Paytm AI Customer Resolution Teammate

## 1. System Overview

The **Paytm AI Customer Resolution Teammate** is a single-process modular monolith designed for autonomous, outcome-verified customer dispute resolution. It establishes a hard boundary between probabilistic LLM reasoning and deterministic financial execution.

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

## 2. Core Authority Invariant

$$\mathbf{AI\ Proposes} \;\longrightarrow\; \mathbf{Policy\ Decides} \;\longrightarrow\; \mathbf{System\ Acts} \;\longrightarrow\; \mathbf{Outcome\ Verifies}$$

| Layer | Responsibility | Authority Level | Access & Mutability |
| :--- | :--- | :--- | :--- |
| **AI Planner** | Interprets issue, context, history, and proposes candidate action | **Probabilistic Reasoning Only** | Read-only input prompt. Zero DB mutation rights. Zero API credentials. |
| **Policy Engine** | Evaluates deterministic guardrails, financial thresholds, risk rules | **Deterministic Gatekeeper** | Pure functional evaluation over authoritative database state. |
| **Tool Executor** | Dispatches authorized actions with `idemp_<stepId>` | **Execution Engine** | Mutates PostgreSQL synthetic state within authorized boundaries. |
| **Outcome Verifier** | Verifies actual transaction status in database | **Ground Truth Authority** | Validates database settlement before declaring business success. |

---

## 3. Policy Rules Reference

| Rule ID | Name | Trigger Condition | Verdict |
| :--- | :--- | :--- | :--- |
| `RP_001` | Active Account & Valid Failure | Account is `ACTIVE` and original txn is `FAILED_AT_BANK` and amount $\le ₹2,000$ | `ALLOWED` |
| `RP_002` | Account Inactive / Frozen | Customer account status is `FROZEN` or `SUSPENDED` | `BLOCKED` |
| `RP_003` | Non-Retryable Status | Original transaction status is not `FAILED_AT_BANK` (e.g. already `SUCCESS`) | `BLOCKED` |
| `RP_004` | Max Retries Exceeded | Session retry count exceeds maximum retry budget (`maxRetries = 2`) | `BLOCKED` |
| `RP_006` | High-Value Financial Action | Transaction amount exceeds autonomous threshold ($> ₹2,000$) | `REQUIRES_HUMAN` |

---

## 4. Idempotency & Financial Safety Protocol

Every financial mutation tool (`retry_payment`) is protected by a deterministic application-generated idempotency key:

$$\text{idempotencyKey} = \text{"idemp\_"} + \text{stepId}$$

1. The Orchestrator generates `stepId` (UUIDv4) and injects `idempotencyKey` into the execution envelope.
2. `transactionService.retryPayment` queries PostgreSQL for existing transactions with this key.
3. If found with status `SUCCESS`, it returns an idempotent replay acknowledgment without executing duplicate gateway calls.

---

## 5. Failure Recovery & Resiliency

- **Crashing During Execution**: If a process restarts while an `ActionStep` is in `PENDING` state, the orchestrator detects the pending step on resume, reconciles against PostgreSQL using the idempotency key, and transitions safely without double-execution.
- **Supervisor Modifications**: If a supervisor modifies transaction parameters in the review queue, the modified action is forced to **freshly re-enter the Policy Engine**. If unsafe, the policy engine blocks the modification.
