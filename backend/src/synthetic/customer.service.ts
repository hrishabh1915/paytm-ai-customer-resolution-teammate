import { prisma } from "../config/db";
import { CustomerAccountStatus } from "../types";

export interface SyntheticCustomerData {
  customerId: string;
  name: string;
  phone: string;
  accountStatus: CustomerAccountStatus;
  syntheticBalance: number;
}

export class CustomerService {
  async getCustomerById(customerId: string): Promise<SyntheticCustomerData | null> {
    const customer = await prisma.syntheticCustomer.findUnique({
      where: { customerId },
    });

    if (!customer) {
      return null;
    }

    return {
      customerId: customer.customerId,
      name: customer.name,
      phone: customer.phone,
      accountStatus: customer.accountStatus,
      syntheticBalance: customer.syntheticBalance.toNumber(),
    };
  }
}

export const customerService = new CustomerService();
