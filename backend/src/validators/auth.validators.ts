import { z } from "zod/v4";

/**
 * Zod schemas for authentication endpoints.
 *
 * WHY SEPARATE FILE?
 * Schemas define "what valid data looks like." Keeping them separate from
 * controllers and services means:
 * - Controllers stay focused on HTTP concerns
 * - Services stay focused on business logic
 * - Schemas are easy to find and update in one place
 *
 * WHAT ZOD DOES:
 * Zod validates data at runtime. TypeScript types only exist at compile time
 * and disappear when the code runs. Zod actually checks the data shape at
 * runtime — essential for validating user input coming from HTTP requests.
 */

/**
 * Signup request validation.
 *
 * - email: must be a valid email format
 * - password: minimum 8 characters (basic security requirement)
 */
export const signupSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Login request validation.
 *
 * - email: must be a valid email format
 * - password: must be a non-empty string (we don't enforce length here because
 *   we're checking against the stored hash, not creating a new password)
 */
export const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * TypeScript types inferred from Zod schemas.
 *
 * WHY z.infer?
 * Instead of manually defining types like:
 *   type SignupInput = { email: string; password: string }
 *
 * We infer them from the Zod schema. This means the validation rules
 * and the TypeScript types are ALWAYS in sync — change the schema,
 * and the type updates automatically. Single source of truth.
 */
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
