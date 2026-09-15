import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { orchestratorService } from "../orchestrator/orchestrator.service";

const humanVerdictSchema = z.object({
  verdict: z.enum(["APPROVED", "REJECTED", "MODIFIED"]),
  reviewerNotes: z.string().optional(),
  modifiedParams: z.record(z.string(), z.unknown()).optional(),
});

const runSessionSchema = z.object({
  maxSteps: z.number().int().positive().max(20).optional().default(10),
});

export const executeSessionStep = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = String(req.params.sessionId);
    const result = await orchestratorService.executeStep(sessionId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const runSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = String(req.params.sessionId);
    const parsed = runSessionSchema.parse(req.body || {});
    const result = await orchestratorService.runSession(sessionId, parsed.maxSteps);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const submitHumanVerdict = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reviewId = String(req.params.reviewId);
    const validatedInput = humanVerdictSchema.parse(req.body);
    const result = await orchestratorService.submitHumanVerdict(reviewId, validatedInput);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getSessionStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = String(req.params.sessionId);
    const result = await orchestratorService.getSessionStatus(sessionId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
