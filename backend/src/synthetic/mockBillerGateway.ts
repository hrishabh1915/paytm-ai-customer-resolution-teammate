export type SimulationMode =
  | "DEFAULT_SUCCESS"
  | "SIMULATE_TIMEOUT"
  | "SIMULATE_BILLER_REJECT"
  | "SIMULATE_GATEWAY_DOWN";

export interface BillerPaymentRequest {
  billerOrMerchant: string;
  amount: number;
  referenceId: string;
}

export interface BillerPaymentResponse {
  success: boolean;
  billerAckId?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export class MockBillerGateway {
  private currentMode: SimulationMode = "DEFAULT_SUCCESS";

  /**
   * Set simulation mode for deterministic test scenarios.
   */
  setSimulationMode(mode: SimulationMode): void {
    this.currentMode = mode;
  }

  getSimulationMode(): SimulationMode {
    return this.currentMode;
  }

  /**
   * Reset back to standard success mode.
   */
  reset(): void {
    this.currentMode = "DEFAULT_SUCCESS";
  }

  /**
   * Process simulated payment to external biller/merchant.
   */
  async processPayment(request: BillerPaymentRequest): Promise<BillerPaymentResponse> {
    switch (this.currentMode) {
      case "SIMULATE_TIMEOUT":
        return {
          success: false,
          error: {
            code: "GATEWAY_TIMEOUT",
            message: "Connection to upstream biller gateway timed out (HTTP 504).",
            retryable: true,
          },
        };

      case "SIMULATE_GATEWAY_DOWN":
        return {
          success: false,
          error: {
            code: "GATEWAY_UNAVAILABLE",
            message: "Upstream biller gateway temporarily unavailable (HTTP 503).",
            retryable: true,
          },
        };

      case "SIMULATE_BILLER_REJECT":
        return {
          success: false,
          error: {
            code: "BILLER_REJECTED",
            message: `Biller '${request.billerOrMerchant}' rejected payment: Consumer bill already closed or invalid.`,
            retryable: false,
          },
        };

      case "DEFAULT_SUCCESS":
      default:
        return {
          success: true,
          billerAckId: `BILLER_ACK_${Math.floor(100000 + Math.random() * 900000)}`,
        };
    }
  }
}

export const mockBillerGateway = new MockBillerGateway();
