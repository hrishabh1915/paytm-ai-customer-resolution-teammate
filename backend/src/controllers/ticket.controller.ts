import { Request, Response, NextFunction } from "express";
import { intakeSchema } from "../types/intake.types";
import { sessionService } from "../services/session.service";

export const intakeTicket = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedInput = intakeSchema.parse(req.body);
    const result = await sessionService.processIntake(validatedInput);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
