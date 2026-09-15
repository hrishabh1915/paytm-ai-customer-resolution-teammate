export interface SupportTicketRequest {
  customerId: string;
  issueCategory: "PAYMENT_FAILURE" | "BILLER_DELAY" | "REFUND_QUERY";
  summary: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
}

export interface SupportTicketResponse {
  supportTicketId: string;
  status: "OPEN";
  assignedQueue: string;
  createdAt: string;
}

export class MockSupportService {
  async createTicket(request: SupportTicketRequest): Promise<SupportTicketResponse> {
    const supportTicketId = `SUP_TKT_${Date.now()}`;
    const assignedQueue =
      request.issueCategory === "PAYMENT_FAILURE"
        ? "PAYMENT_OPS_QUEUE"
        : request.issueCategory === "BILLER_DELAY"
        ? "BILLER_RECONCILIATION_QUEUE"
        : "GENERAL_SUPPORT_QUEUE";

    return {
      supportTicketId,
      status: "OPEN",
      assignedQueue,
      createdAt: new Date().toISOString(),
    };
  }
}

export const mockSupportService = new MockSupportService();
