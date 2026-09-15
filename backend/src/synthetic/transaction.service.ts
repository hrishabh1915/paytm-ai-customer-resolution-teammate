import { prisma } from "../config/db";
import { TransactionStatus } from "../types";
import { mockBillerGateway } from "./mockBillerGateway";
import { ToolResult } from "../tools/types";

export interface SyntheticTransactionData {
  transactionId: string;
  customerId: string;
  amount: number;
  billerOrMerchant: string;
  status: TransactionStatus;
  failureReason: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface RetryPaymentInput {
  originalTransactionId: string;
  idempotencyKey: string;
}

export interface RetryPaymentSuccessData {
  originalTransactionId: string;
  newTransactionId: string;
  amount: number;
  billerOrMerchant: string;
  status: "SUCCESS";
  billerAckId: string;
  message: string;
  isReplay?: boolean;
}

export class TransactionService {
  /**
   * Get single transaction by ID.
   */
  async getTransactionById(transactionId: string): Promise<SyntheticTransactionData | null> {
    const txn = await prisma.syntheticTransaction.findUnique({
      where: { transactionId },
    });

    if (!txn) {
      return null;
    }

    return {
      transactionId: txn.transactionId,
      customerId: txn.customerId,
      amount: txn.amount.toNumber(),
      billerOrMerchant: txn.billerOrMerchant,
      status: txn.status,
      failureReason: txn.failureReason,
      idempotencyKey: txn.idempotencyKey,
      createdAt: txn.createdAt.toISOString(),
    };
  }

  /**
   * Get customer transaction history ordered by latest first.
   */
  async getTransactionHistory(
    customerId: string,
    limit: number = 5
  ): Promise<SyntheticTransactionData[]> {
    const records = await prisma.syntheticTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return records.map((txn) => ({
      transactionId: txn.transactionId,
      customerId: txn.customerId,
      amount: txn.amount.toNumber(),
      billerOrMerchant: txn.billerOrMerchant,
      status: txn.status,
      failureReason: txn.failureReason,
      idempotencyKey: txn.idempotencyKey,
      createdAt: txn.createdAt.toISOString(),
    }));
  }

  /**
   * Retry payment with authoritative derivation and idempotency.
   */
  async retryPayment(input: RetryPaymentInput): Promise<ToolResult<RetryPaymentSuccessData>> {
    const toolName = "retry_payment";

    // 1. Check for existing transaction with the same idempotency key
    const existingWithKey = await prisma.syntheticTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existingWithKey) {
      // If already exists and is for the same original context
      if (existingWithKey.status === TransactionStatus.SUCCESS) {
        return {
          success: true,
          toolName,
          data: {
            originalTransactionId: input.originalTransactionId,
            newTransactionId: existingWithKey.transactionId,
            amount: existingWithKey.amount.toNumber(),
            billerOrMerchant: existingWithKey.billerOrMerchant,
            status: "SUCCESS",
            billerAckId: `REPLAY_${existingWithKey.transactionId}`,
            message: "Idempotent replay: previous successful transaction returned.",
            isReplay: true,
          },
        };
      } else {
        return {
          success: false,
          toolName,
          error: {
            code: "IDEMPOTENCY_CONFLICT",
            message: `An existing transaction '${existingWithKey.transactionId}' with status '${existingWithKey.status}' was already processed with this idempotency key.`,
            retryable: false,
          },
        };
      }
    }

    // 2. Fetch authoritative original transaction record from database
    const originalTxn = await prisma.syntheticTransaction.findUnique({
      where: { transactionId: input.originalTransactionId },
    });

    if (!originalTxn) {
      return {
        success: false,
        toolName,
        error: {
          code: "TRANSACTION_NOT_FOUND",
          message: `Original transaction '${input.originalTransactionId}' does not exist.`,
          retryable: false,
        },
      };
    }

    // 3. Precondition check: must be in FAILED_AT_BANK status
    if (originalTxn.status !== TransactionStatus.FAILED_AT_BANK) {
      return {
        success: false,
        toolName,
        error: {
          code: "PRECONDITION_FAILED",
          message: `Cannot retry transaction with status '${originalTxn.status}'. Retry is only permitted for 'FAILED_AT_BANK' transactions.`,
          retryable: false,
        },
      };
    }

    // 4. Derive parameters authoritatively
    const customerId = originalTxn.customerId;
    const amount = originalTxn.amount.toNumber();
    const billerOrMerchant = originalTxn.billerOrMerchant;

    // 5. Dispatch to Mock Biller Gateway
    const gatewayResult = await mockBillerGateway.processPayment({
      billerOrMerchant,
      amount,
      referenceId: input.idempotencyKey,
    });

    const newTransactionId = `txn_retry_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

    // 6. Handle gateway failure
    if (!gatewayResult.success || !gatewayResult.billerAckId) {
      // Record failed retry in synthetic database
      await prisma.syntheticTransaction.create({
        data: {
          transactionId: newTransactionId,
          customerId,
          amount,
          billerOrMerchant,
          status: TransactionStatus.FAILED_AT_BANK,
          failureReason: gatewayResult.error?.message || "Biller retry failed",
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        success: false,
        toolName,
        error: gatewayResult.error || {
          code: "PAYMENT_RETRY_FAILED",
          message: "Upstream biller rejected payment retry.",
          retryable: true,
        },
      };
    }

    // 7. Handle gateway success: record successful transaction in database
    const createdTxn = await prisma.syntheticTransaction.create({
      data: {
        transactionId: newTransactionId,
        customerId,
        amount,
        billerOrMerchant,
        status: TransactionStatus.SUCCESS,
        idempotencyKey: input.idempotencyKey,
      },
    });

    return {
      success: true,
      toolName,
      data: {
        originalTransactionId: input.originalTransactionId,
        newTransactionId: createdTxn.transactionId,
        amount: createdTxn.amount.toNumber(),
        billerOrMerchant: createdTxn.billerOrMerchant,
        status: "SUCCESS",
        billerAckId: gatewayResult.billerAckId,
        message: "Payment successfully cleared and acknowledged by biller.",
      },
    };
  }
}

export const transactionService = new TransactionService();
