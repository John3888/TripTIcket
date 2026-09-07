import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      ok: false,
      error: "Invalid request data.",
      details: error.flatten(),
    });
    return;
  }
  const status = error instanceof AppError ? error.status : 500;
  if (status >= 500) console.error(error);
  response.status(status).json({
    ok: false,
    error: error instanceof Error ? error.message : "Internal server error.",
  });
};
