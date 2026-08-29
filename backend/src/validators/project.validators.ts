import { z } from "zod/v4";

/**
 * Zod schemas for Project endpoints.
 *
 * WHY VALIDATE PROJECT NAMES?
 * We want project names to be meaningful (not empty strings or spaces)
 * but we don't need to be overly strict. A developer should be able to
 * name their project "My E-commerce API" or "staging-api" etc.
 */

/**
 * Create project — just needs a name.
 * Keeping it simple for V1. No descriptions, tags, or settings.
 */
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be 100 characters or less")
    .trim(), // .trim() strips leading/trailing whitespace automatically
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
