import { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { AppError } from "../utils/errors.js";

/**
 * Generic Zod validation middleware factory.
 *
 * WHY: Every API endpoint that accepts user input needs validation.
 * Instead of writing validation logic in each controller, we create
 * a reusable middleware that takes a Zod schema and validates req.body.
 *
 * HOW TO USE:
 *   import { signupSchema } from "../validators/auth.validators.js";
 *
 *   router.post("/signup", validate(signupSchema), authController.signup);
 *
 * WHAT IT DOES:
 * 1. Takes the incoming req.body
 * 2. Runs it through the Zod schema
 * 3. If valid → replaces req.body with the parsed (clean) data and calls next()
 * 4. If invalid → throws an AppError with the first validation error message
 *
 * WHY REPLACE req.body?
 * Zod's .parse() strips unknown fields and coerces types.
 * By replacing req.body with the parsed output, our controller
 * only ever sees validated, clean data. No unexpected fields sneak through.
 */
export function validate(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Get the first error message for a clean response
      const firstIssue = result.error.issues[0];
      throw new AppError(400, "VALIDATION_ERROR", firstIssue.message);
    }

    // Replace req.body with parsed data (strips unknown fields, applies defaults)
    req.body = result.data;
    next();
  };
}
