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
  // express.json rejects malformed JSON and primitive roots (including null).
  // Do not turn client parse errors into a 500 or log their potentially
  // sensitive raw request bodies.
  if (error?.type === "entity.parse.failed" && error.status === 400) {
    response.status(400).json({
      ok: false,
      error: "Invalid JSON request body. Send a JSON object, not null or a primitive value.",
    });
    return;
  }
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
