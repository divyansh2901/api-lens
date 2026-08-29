/**
 * Custom application error class.
 *
 * WHY: Instead of writing res.status(400).json({ error: "..." }) in every controller,
 * we throw an AppError and let a centralized error-handling middleware catch it.
 * This keeps our controllers clean and all error responses consistent.
 *
 * HOW IT WORKS:
 *   throw new AppError(400, "VALIDATION_ERROR", "Invalid email format");
 *
 * The error handler middleware (error-handler.ts) will catch this and send:
 *   { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid email format" } }
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}
