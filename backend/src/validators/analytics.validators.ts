import { z } from "zod/v4";

const range = z.enum(["1h", "24h", "7d", "30d"]).optional();
const from = z.iso.datetime({ offset: true }).optional();
const to = z.iso.datetime({ offset: true }).optional();

function validateDateRange(
  value: { range?: string; from?: string; to?: string },
  context: z.RefinementCtx,
): void {
  if (Boolean(value.from) !== Boolean(value.to)) {
    context.addIssue({ code: "custom", message: "Provide both from and to for a custom time range" });
    return;
  }
  if (!value.from || !value.to) return;

  if (value.range) {
    context.addIssue({ code: "custom", path: ["range"], message: "Use either range or from/to, not both" });
    return;
  }

  const fromDate = new Date(value.from);
  const toDate = new Date(value.to);
  const durationMs = toDate.getTime() - fromDate.getTime();
  if (durationMs <= 0) {
    context.addIssue({ code: "custom", path: ["to"], message: "to must be later than from" });
  } else if (durationMs > 30 * 24 * 60 * 60 * 1_000) {
    context.addIssue({ code: "custom", path: ["from"], message: "Custom time ranges cannot exceed 30 days" });
  } else if (toDate.getTime() > Date.now()) {
    context.addIssue({ code: "custom", path: ["to"], message: "to cannot be in the future" });
  }
}

export const analyticsTimeRangeSchema = z.object({
  range,
  from,
  to,
}).strict().superRefine(validateDateRange);

const pageNumber = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100_000));
const pageSize = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100));

export const recentRequestsQuerySchema = z.object({
  range,
  from,
  to,
  page: pageNumber.optional(),
  limit: pageSize.optional(),
}).strict().superRefine(validateDateRange);

export type AnalyticsTimeRangeQuery = z.infer<typeof analyticsTimeRangeSchema>;
export type RecentRequestsQuery = z.infer<typeof recentRequestsQuerySchema>;
