import {
  PlannerInput,
  PlannerResult,
  PlannerOutput,
  plannerOutputSchema,
} from "./types";
import { ILlmAdapter, defaultGeminiAdapter } from "./adapters/geminiAdapter";
import { buildResolutionPrompt } from "./prompts/resolutionPrompt";
import { toolRegistry } from "../tools/toolRegistry";

export class PlannerService {
  private adapter: ILlmAdapter;

  constructor(adapter: ILlmAdapter = defaultGeminiAdapter) {
    this.adapter = adapter;
  }

  /**
   * Set or swap LLM adapter (useful for testing or changing model provider).
   */
  setAdapter(adapter: ILlmAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Proposes the single next action for a customer resolution session.
   * Pure reasoning transformation: does NOT execute tools or mutate DB.
   */
  async planNextAction(
    input: PlannerInput,
    options?: { timeoutMs?: number }
  ): Promise<PlannerResult> {
    const prompt = buildResolutionPrompt(input);

    let rawText = "";
    let modelName = "unknown-model";
    let latencyMs = 0;

    // 1. Invoke LLM Adapter
    try {
      const result = await this.adapter.generate(prompt, options);
      rawText = result.rawText;
      modelName = result.model;
      latencyMs = result.latencyMs;
    } catch (error: any) {
      const message = error.message || String(error);
      if (message.startsWith("MISSING_API_KEY")) {
        return {
          success: false,
          errorCode: "MISSING_API_KEY",
          message,
        };
      }
      if (message.startsWith("ADAPTER_TIMEOUT")) {
        return {
          success: false,
          errorCode: "ADAPTER_TIMEOUT",
          message,
        };
      }
      return {
        success: false,
        errorCode: "ADAPTER_NETWORK_ERROR",
        message: `LLM Adapter failed: ${message}`,
      };
    }

    // 2. Safe JSON Extraction
    let parsedJson: unknown;
    try {
      // Strip optional markdown code fences if model enclosed JSON in ```json ... ```
      const cleanedText = rawText
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/\s*```$/, "");

      parsedJson = JSON.parse(cleanedText);
    } catch (jsonErr: any) {
      return {
        success: false,
        errorCode: "MALFORMED_JSON",
        message: `Failed to parse model output as JSON: ${jsonErr.message}`,
        rawOutput: rawText,
      };
    }

    // 3. Validate Structured Output with Zod
    const zodResult = plannerOutputSchema.safeParse(parsedJson);
    if (!zodResult.success) {
      return {
        success: false,
        errorCode: "SCHEMA_VALIDATION_ERROR",
        message: `Model output violated schema: ${zodResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        rawOutput: rawText,
      };
    }

    const validatedOutput: PlannerOutput = zodResult.data;
    const proposedTool = validatedOutput.proposedAction.toolName;

    // 4. Validate Tool Name Against Existing Tool Registry
    if (!toolRegistry.hasTool(proposedTool)) {
      return {
        success: false,
        errorCode: "UNKNOWN_TOOL",
        message: `Proposed tool '${proposedTool}' is not recognized in the Tool Registry.`,
        rawOutput: rawText,
      };
    }

    // 5. Sanitize Planner-Controlled Parameters
    // For retry_payment: AI must only supply originalTransactionId. Strip prohibited params.
    if (proposedTool === "retry_payment") {
      const rawParams = validatedOutput.proposedAction.params;
      const originalTxnId =
        (rawParams.originalTransactionId as string) ||
        input.authoritativeContext.targetTransaction?.transactionId ||
        "";

      validatedOutput.proposedAction.params = {
        originalTransactionId: originalTxnId,
      };
    }

    // 6. Return Structured Planner Success
    return {
      success: true,
      output: validatedOutput,
      model: modelName,
      latencyMs,
    };
  }
}

export const plannerService = new PlannerService();
