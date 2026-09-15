# Judge Q&A Defense Guide — Paytm AI Customer Resolution Teammate

This document contains authoritative, technically grounded answers to top questions judges ask during hackathon evaluations. Every answer is based strictly on the actual implementation in this repository.

---

### 1. Why is this an AI teammate instead of a chatbot?
A chatbot only produces conversational text responses. If a payment fails, a chatbot can only say *"Please wait 3-5 days or contact support"*. 

An **AI Teammate** has agency within a controlled harness:
- It investigates context from authoritative databases.
- It proposes concrete operational remediation actions (`retry_payment`, `send_customer_notification`).
- It submits proposals to a deterministic policy boundary.
- It drives the workflow until an **independent verifier confirms business resolution**.

---

### 2. What makes it autonomous?
The teammate can autonomously formulate next actions, pass policy guardrails, trigger tool execution, inspect tool observations, and loop until the business goal is met or human escalation is required. It is **bounded autonomous**: autonomy exists strictly within the boundaries authorized by deterministic code.

---

### 3. Why not let the LLM directly call payment APIs?
Giving an LLM direct API keys or tool execution rights creates catastrophic financial and operational risk:
- **Hallucination Risk**: An LLM might retry an already-settled transaction or send arbitrary amounts.
- **Prompt Injection**: Malicious customer tickets could trick the model into calling destructive endpoints.
- **Unbounded Authority**: Probabilistic models cannot be formally proven safe.

In our system: **AI Proposes $\to$ Policy Decides $\to$ System Acts $\to$ Outcome Verifies**. The LLM never holds execution tokens or direct database access.

---

### 4. Why do you need a deterministic Policy Engine?
Policy guardrails (e.g., maximum retry amounts, account status checks, rate limits) must be **100% deterministic and mathematically enforceable**. 
- If a customer account is `FROZEN`, execution must be blocked with probability $P = 1.0$.
- If a bill retry exceeds ₹2,000, human supervisor approval must be required with probability $P = 1.0$.
A deterministic engine implemented in TypeScript ensures zero probabilistic bypass.

---

### 5. What happens if the LLM hallucinates?
1. **Schema Validation**: Output is validated against strict Zod schemas (`PlannerOutput`). Invalid schemas fail immediately.
2. **Tool Registry Gate**: The tool name must exist in our registered 7-tool registry; arbitrary tool names are rejected.
3. **Parameter Sanitization**: The application layer strips prohibited planner parameters (e.g. LLM cannot generate financial idempotency keys).
4. **Policy Engine Gate**: The proposed action is evaluated against authoritative database state. If hallucinated parameters violate rules, Policy Engine returns `BLOCKED`.
5. **Outcome Verifier**: The AI cannot declare success; only PostgreSQL state change can mark resolution.

---

### 6. What happens if the tool fails?
When a tool execution fails (e.g., downstream biller gateway timeout):
1. The error observation is recorded in `ActionStep.executionResult` with `executionStatus: FAILED`.
2. The orchestrator records a `TOOL_EXECUTED` audit event.
3. The session state increments `retryCount`. If `retryCount <= maxRetries`, the AI Planner replans using the failure observation.
4. If retries are exhausted, the orchestrator escalates the session to `ESCALATED` for human support.

---

### 7. What happens if the payment succeeds but the LLM thinks it failed?
The LLM's belief does not control session completion. 
Before each cycle, the **OutcomeVerifier** independently queries the PostgreSQL database for the target transaction status. If PostgreSQL confirms `SUCCESS`, the Orchestrator short-circuits directly to `RESOLVED_SUCCESS` regardless of what the LLM proposes.

---

### 8. What happens if the same action is executed twice?
Our system uses deterministic **Idempotency Keys** (`idemp_<stepId>`). 
If a tool execution is retried or replayed with the same key, `transactionService.retryPayment` detects the existing idempotency key in PostgreSQL and returns the cached result without creating a duplicate debit or downstream transaction.

---

### 9. Why is idempotency necessary?
In distributed payment systems, network timeouts can occur after money is deducted but before the client receives the ACK. Without idempotency, automatic retries would double-charge the customer. Application-controlled idempotency keys guarantee exactly-once financial mutation.

---

### 10. Why is human-in-the-loop necessary?
High-value financial operations (e.g., transactions $> ₹2,000$), suspicious customer states, or repeated ambiguous failures carry elevated risk. 
Rather than guessing, Policy Engine triggers `REQUIRES_HUMAN` and creates a `HumanReview` record, pausing the session until a supervisor approves, rejects, or modifies the action.

---

### 11. Why is confidence not enough?
LLMs are frequently overconfident on incorrect outputs. A model might express 99% confidence while proposing a payment retry on a frozen account. In our architecture, model confidence is strictly **INFORMATIONAL ONLY**. It has zero authorization weight in Policy Engine decisions.

---

### 12. How do you prevent prompt injection?
1. The customer issue description is treated strictly as **untrusted data** inside a delimited JSON block in the prompt.
2. The model output is constrained to a single JSON object.
3. Even if a prompt injection successfully forces the LLM to output `{ "toolName": "retry_payment" }`, the proposal must pass Policy Engine guardrails, which derive customer and balance context from PostgreSQL, not from user text.

---

### 13. How do you verify the outcome?
The `OutcomeVerifier` component queries PostgreSQL directly to verify that:
1. A new retry transaction exists and has status `SUCCESS`.
2. A valid biller acknowledgment ID (`billerAckId`) is recorded.
3. The customer's synthetic balance was correctly reconciled.
Only when this ground truth is asserted does the session reach `VERIFIED_SUCCESS`.

---

### 14. Why not use multiple agents?
Multi-agent swarms (e.g., Agent A talking to Agent B talking to Agent C) introduce non-deterministic compounding error rates, race conditions, and lack of clear auditability. 
For financial operations, a **Single-Process Modular Monolith with a Deterministic Control Plane** is vastly safer, faster, auditable, and easier to reason about.

---

### 15. Why PostgreSQL?
PostgreSQL provides ACID transactions, relational integrity, row-level locking for concurrency protection, and an immutable storage layer for `audit_log_entries`, `action_steps`, and `human_reviews`.

---

### 16. How would this scale in production?
In a full production deployment:
- The Express/Node.js orchestrator runs horizontally behind a load balancer with Redis/PostgreSQL advisory locks per `sessionId`.
- Tools connect to real Paytm microservices via internal gRPC/mTLS APIs with circuit breakers.
- Audit logs stream to ClickHouse/Snowflake for regulatory compliance.

---

### 17. How would you integrate real Paytm systems?
1. Replace `MockBillerGateway` with Paytm's Core Payment Switch / BBPS gateway client.
2. Replace synthetic Prisma queries with existing internal customer/wallet gRPC microservices.
3. Keep the Orchestrator, Policy Engine, AI Planner, and Outcome Verifier architecture identical.

---

### 18. What data is synthetic?
All customers (Aarav, Pooja, Neha), wallets, and transactions in this prototype are synthetic mock entities stored in PostgreSQL demo tables. No real customer PII or real bank accounts are accessed.

---

### 19. What exactly is AI responsible for?
- Understanding the unstructured customer complaint.
- Interpreting recent transaction history and context.
- Proposing candidate remediation strategies and parameters.
- Drafting personalized customer notification messages.

---

### 20. What exactly is deterministic infrastructure responsible for?
- Authorization & policy guardrail evaluation (`PolicyEngine`).
- Generating financial idempotency keys.
- Executing tools and mutating authoritative state (`ToolExecutor`).
- Recording tamper-evident audit logs (`AuditService`).
- Managing session state transitions and concurrency locks.
- Independent ground truth assertion (`OutcomeVerifier`).
