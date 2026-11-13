import { z } from "zod/v4";

export const askAnalyticsSchema = z.object({
  question: z.string().trim().min(3, "Ask a question with at least 3 characters").max(500, "Questions cannot exceed 500 characters"),
}).strict();

export type AskAnalyticsInput = z.infer<typeof askAnalyticsSchema>;
