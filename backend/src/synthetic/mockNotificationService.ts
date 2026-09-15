export interface NotificationRequest {
  customerId: string;
  recipientPhone: string;
  message: string;
  channel: "SMS" | "IN_APP";
}

export interface NotificationResponse {
  notificationId: string;
  recipient: string;
  channel: "SMS" | "IN_APP";
  deliveredAt: string;
}

export class MockNotificationService {
  async sendNotification(request: NotificationRequest): Promise<NotificationResponse> {
    const notificationId = `notif_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    
    return {
      notificationId,
      recipient: request.recipientPhone || request.customerId,
      channel: request.channel,
      deliveredAt: new Date().toISOString(),
    };
  }
}

export const mockNotificationService = new MockNotificationService();
