import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../types/errors";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "ValidationError",
      message: "Invalid request payload",
      details: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  console.error("Unhandled Error:", err);
  res.status(500).json({
    error: "InternalServerError",
    message: err.message || "An unexpected error occurred",
  });
};
