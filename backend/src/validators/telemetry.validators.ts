import { z } from "zod/v4";

/** The Phase 4 SDK's privacy-safe event contract. */
export const telemetrySchema = z.object({
  method: z
    .string()
    .regex(/^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]{0,15}$/, "Method must be an uppercase HTTP token"),
  route: z
    .string()
    .min(1, "Route is required")
    .max(512, "Route must be 512 characters or less")
    .regex(/^\/[^\s?#]*$/, "Route must be a normalized path without a query string"),
  statusCode: z.number().int().min(100).max(599),
  latency: z.number().int().min(0).max(2_147_483_647),
  timestamp: z.iso.datetime({ offset: true }),
}).strict();

export type TelemetryInput = z.infer<typeof telemetrySchema>;

export interface TelemetryMessage extends TelemetryInput {
  projectId: string;
}
