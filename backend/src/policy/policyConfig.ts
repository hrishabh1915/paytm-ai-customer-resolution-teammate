import { z } from "zod";

const policyConfigSchema = z.object({
  maxAutonomousRetryAmount: z
    .number()
    .positive("maxAutonomousRetryAmount must be positive")
    .default(2000),
  maxRetriesPerSession: z
    .number()
    .int()
    .min(1, "maxRetriesPerSession must be at least 1")
    .default(1),
  allowedNotificationChannels: z
    .array(z.string())
    .min(1, "At least one notification channel must be allowed")
    .default(["SMS", "IN_APP"]),
});

export type PolicyConfig = z.infer<typeof policyConfigSchema>;

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  maxAutonomousRetryAmount: 2000,
  maxRetriesPerSession: 1,
  allowedNotificationChannels: ["SMS", "IN_APP"],
};

export function loadPolicyConfig(): PolicyConfig {
  const envAmount = process.env.POLICY_MAX_RETRY_AMOUNT
    ? parseFloat(process.env.POLICY_MAX_RETRY_AMOUNT)
    : DEFAULT_POLICY_CONFIG.maxAutonomousRetryAmount;

  const envRetries = process.env.POLICY_MAX_RETRIES
    ? parseInt(process.env.POLICY_MAX_RETRIES, 10)
    : DEFAULT_POLICY_CONFIG.maxRetriesPerSession;

  const parseResult = policyConfigSchema.safeParse({
    maxAutonomousRetryAmount: isNaN(envAmount) ? 2000 : envAmount,
    maxRetriesPerSession: isNaN(envRetries) ? 1 : envRetries,
    allowedNotificationChannels: DEFAULT_POLICY_CONFIG.allowedNotificationChannels,
  });

  if (!parseResult.success) {
    console.warn(
      "Warning: Invalid policy configuration detected, falling back to safe defaults:",
      parseResult.error.issues
    );
    return DEFAULT_POLICY_CONFIG;
  }

  return parseResult.data;
}

export const policyConfig = loadPolicyConfig();
