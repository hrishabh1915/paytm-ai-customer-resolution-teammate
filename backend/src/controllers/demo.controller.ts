import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/db";
import { sessionService } from "../services/session.service";
import { CustomerAccountStatus, TransactionStatus } from "../types";
import { BadRequestError } from "../types/errors";

const seedScenarioSchema = z.object({
  scenario: z.enum(["SCENARIO_A", "SCENARIO_B", "SCENARIO_C"]),
});

export const DEMO_SCENARIOS = [
  {
    id: "SCENARIO_A",
    title: "Scenario A — Autonomous Recovery",
    badge: "Autonomous",
    description: "Failed ₹1,250 electricity bill. AI proposes retry, Policy Engine authorizes (ALLOWED), transaction succeeds, outcome is verified against PostgreSQL, notification sent, session marks RESOLVED_SUCCESS.",
    customer: {
      id: "cust_demo_a",
      name: "Aarav Sharma",
      phone: "+91 98765 43210",
      status: "ACTIVE",
      balance: 5000,
    },
    transaction: {
      id: "txn_demo_a",
      amount: 1250,
      biller: "Tata Power",
      status: "FAILED_AT_BANK",
      reason: "GATEWAY_TIMEOUT",
    },
    expectedFlow: "AI Plan → Policy ALLOWED → Tool Execution → Outcome Verification → RESOLVED_SUCCESS",
  },
  {
    id: "SCENARIO_B",
    title: "Scenario B — Human Approval Required",
    badge: "Human Review",
    description: "High-value ₹3,500 electricity payment exceeding autonomous threshold (₹2,000). AI proposes retry, Policy Engine pauses session with REQUIRES_HUMAN. Supervisor approves, passes re-policy evaluation, completes resolution.",
    customer: {
      id: "cust_demo_b",
      name: "Pooja Patel",
      phone: "+91 98765 43211",
      status: "ACTIVE",
      balance: 10000,
    },
    transaction: {
      id: "txn_demo_b",
      amount: 3500,
      biller: "Adani Electricity",
      status: "FAILED_AT_BANK",
      reason: "NETWORK_ERROR",
    },
    expectedFlow: "AI Plan → Policy REQUIRES_HUMAN → Human Review Queue → Supervisor Approval → Re-Policy → Execution → RESOLVED_SUCCESS",
  },
  {
    id: "SCENARIO_C",
    title: "Scenario C — Deterministic Safety Block",
    badge: "Blocked",
    description: "Customer account is FROZEN. AI planner proposes payment retry, but Policy Engine deterministically BLOCKS execution (RP_002). No tool is executed, preventing unsafe financial mutation.",
    customer: {
      id: "cust_demo_c",
      name: "Neha Gupta",
      phone: "+91 98765 43213",
      status: "FROZEN",
      balance: 2000,
    },
    transaction: {
      id: "txn_demo_c",
      amount: 500,
      biller: "BESCOM Electricity",
      status: "FAILED_AT_BANK",
      reason: "ACCOUNT_INACTIVE",
    },
    expectedFlow: "AI Plan → Policy BLOCKED → Zero Tool Execution → RESOLVED_FAILURE (Safe Guardrail)",
  },
];

export const getDemoScenarios = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({
      scenarios: DEMO_SCENARIOS,
    });
  } catch (error) {
    next(error);
  }
};

export const seedDemoScenario = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { scenario } = seedScenarioSchema.parse(req.body);

    let customerId = "";
    let name = "";
    let phone = "";
    let accountStatus: CustomerAccountStatus = CustomerAccountStatus.ACTIVE;
    let balance = 5000;
    let transactionId = "";
    let amount = 1250;
    let biller = "Tata Power";
    let failureReason = "GATEWAY_TIMEOUT";

    const timestamp = Date.now();

    if (scenario === "SCENARIO_A") {
      customerId = `cust_demo_a_${timestamp}`;
      name = "Aarav Sharma";
      phone = "+919876543210";
      accountStatus = CustomerAccountStatus.ACTIVE;
      balance = 5000;
      transactionId = `txn_demo_a_${timestamp}`;
      amount = 1250;
      biller = "Tata Power";
      failureReason = "GATEWAY_TIMEOUT";
    } else if (scenario === "SCENARIO_B") {
      customerId = `cust_demo_b_${timestamp}`;
      name = "Pooja Patel";
      phone = "+919876543211";
      accountStatus = CustomerAccountStatus.ACTIVE;
      balance = 10000;
      transactionId = `txn_demo_b_${timestamp}`;
      amount = 3500;
      biller = "Adani Electricity";
      failureReason = "NETWORK_ERROR";
    } else if (scenario === "SCENARIO_C") {
      customerId = `cust_demo_c_${timestamp}`;
      name = "Neha Gupta";
      phone = "+919876543213";
      accountStatus = CustomerAccountStatus.FROZEN;
      balance = 2000;
      transactionId = `txn_demo_c_${timestamp}`;
      amount = 500;
      biller = "BESCOM Electricity";
      failureReason = "ACCOUNT_INACTIVE";
    }

    // 1. Seed customer
    const customer = await prisma.syntheticCustomer.create({
      data: {
        customerId,
        name,
        phone,
        accountStatus,
        syntheticBalance: balance,
      },
    });

    // 2. Seed transaction
    const transaction = await prisma.syntheticTransaction.create({
      data: {
        transactionId,
        customerId: customer.customerId,
        amount,
        billerOrMerchant: biller,
        status: TransactionStatus.FAILED_AT_BANK,
        failureReason,
      },
    });

    // 3. Create intake session
    const intakeResult = await sessionService.processIntake({
      customerId: customer.customerId,
      transactionId: transaction.transactionId,
      statedObjective: "RETRY_PAYMENT",
    });

    const scenarioMeta = DEMO_SCENARIOS.find((s) => s.id === scenario);

    res.status(201).json({
      sessionId: intakeResult.sessionId,
      scenario,
      scenarioMeta,
      customer: {
        customerId: customer.customerId,
        name: customer.name,
        phone: customer.phone,
        accountStatus: customer.accountStatus,
        syntheticBalance: customer.syntheticBalance.toNumber(),
      },
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.amount.toNumber(),
        billerOrMerchant: transaction.billerOrMerchant,
        status: transaction.status,
        failureReason: transaction.failureReason,
      },
      statedObjective: "RETRY_PAYMENT",
    });
  } catch (error) {
    next(error);
  }
};
