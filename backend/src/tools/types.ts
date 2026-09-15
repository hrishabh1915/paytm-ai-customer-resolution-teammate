import { z } from "zod";

export type ToolCategory = "READ_ONLY" | "MUTATING" | "HUMAN";

export interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ToolResult<T = any> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: ToolError;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: ToolCategory;
  schema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<ToolResult<TOutput>>;
}
