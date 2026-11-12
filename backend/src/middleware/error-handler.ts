import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";

/**
 * Centralized error-handling middleware.
 *
 * WHY: Express has a special middleware signature with 4 params (err, req, res, next).
 * When any route or middleware calls next(error) or throws an error (Express 5 catches
 * async throws automatically), this middleware runs.
 *
 * This gives us ONE place to format all error responses instead of repeating
 * try/catch + res.status().json() in every controller.
 *
 * WHAT IT DOES:
 * - If it's our custom AppError → send the structured error with the right status code
 * - If it's an unknown error → send a generic 500 (never expose internals to the client)
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const bodyParserError = err as Error & { type?: string };
  if (bodyParserError.type === "entity.parse.failed") {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON" },
    });
    return;
  }
  if (bodyParserError.type === "entity.too.large") {
    res.status(413).json({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds the 16 KB limit" },
    });
    return;
  }

  // If it's our custom error, we know the status code and error code
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Unknown error — log it for debugging, but send a generic response
  // Never expose stack traces or internal details to the client
  console.error("Unexpected error:", err);

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
}
