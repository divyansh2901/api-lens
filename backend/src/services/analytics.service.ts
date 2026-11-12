import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "../config/prisma.js";
import * as projectService from "./project.service.js";
import type { AnalyticsTimeRangeQuery, RecentRequestsQuery } from "../validators/analytics.validators.js";
import { AppError } from "../utils/errors.js";

const PRESET_DURATIONS: Record<"1h" | "24h" | "7d" | "30d", number> = {
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

const TRAFFIC_BUCKETS = [
  { maxDuration: PRESET_DURATIONS["1h"], milliseconds: 60_000, interval: Prisma.raw("INTERVAL '1 minute'"), label: "1 minute" },
  { maxDuration: PRESET_DURATIONS["24h"], milliseconds: 60 * 60_000, interval: Prisma.raw("INTERVAL '1 hour'"), label: "1 hour" },
  { maxDuration: PRESET_DURATIONS["7d"], milliseconds: 6 * 60 * 60_000, interval: Prisma.raw("INTERVAL '6 hours'"), label: "6 hours" },
  { maxDuration: Number.POSITIVE_INFINITY, milliseconds: 24 * 60 * 60_000, interval: Prisma.raw("INTERVAL '1 day'"), label: "1 day" },
] as const;

export interface ResolvedTimeRange {
  preset: string;
  from: Date;
  to: Date;
}

type OwnershipCheck = (userId: string, projectId: string) => Promise<unknown>;

interface AnalyticsDependencies {
  db?: PrismaClient;
  ensureOwnership?: OwnershipCheck;
  now?: () => Date;
}

export interface AnalyticsService {
  overview(userId: string, projectId: string, query: AnalyticsTimeRangeQuery): Promise<Record<string, unknown>>;
  traffic(userId: string, projectId: string, query: AnalyticsTimeRangeQuery): Promise<Record<string, unknown>>;
  statusCodes(userId: string, projectId: string, query: AnalyticsTimeRangeQuery): Promise<Record<string, unknown>>;
  topEndpoints(userId: string, projectId: string, query: AnalyticsTimeRangeQuery): Promise<Record<string, unknown>>;
  slowestEndpoints(userId: string, projectId: string, query: AnalyticsTimeRangeQuery): Promise<Record<string, unknown>>;
  endpointErrors(userId: string, projectId: string, query: AnalyticsTimeRangeQuery): Promise<Record<string, unknown>>;
  recentRequests(userId: string, projectId: string, query: RecentRequestsQuery): Promise<Record<string, unknown>>;
}

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function resolveTimeRange(query: AnalyticsTimeRangeQuery, now = new Date()): ResolvedTimeRange {
  if (query.from && query.to) {
    return { preset: "custom", from: new Date(query.from), to: new Date(query.to) };
  }
  const preset = query.range ?? "24h";
  const duration = PRESET_DURATIONS[preset as keyof typeof PRESET_DURATIONS];
  if (!duration) throw new AppError(400, "INVALID_TIME_RANGE", "Unsupported analytics time range");
  return { preset, from: new Date(now.getTime() - duration), to: now };
}

export function createAnalyticsService(dependencies: AnalyticsDependencies = {}): AnalyticsService {
  const db = dependencies.db ?? prisma;
  const ensureOwnership = dependencies.ensureOwnership ?? projectService.getProject;
  const now = dependencies.now ?? (() => new Date());

  async function prepare(userId: string, projectId: string, query: AnalyticsTimeRangeQuery) {
    await ensureOwnership(userId, projectId);
    const timeRange = resolveTimeRange(query, now());
    const where: Prisma.RequestLogWhereInput = {
      projectId,
      timestamp: { gte: timeRange.from, lt: timeRange.to },
    };
    return { timeRange, where };
  }

  return {
    async overview(userId, projectId, query) {
      const { timeRange, where } = await prepare(userId, projectId, query);
      const [aggregate, errors] = await Promise.all([
        db.requestLog.aggregate({ where, _count: { _all: true }, _avg: { latency: true } }),
        db.requestLog.count({ where: { ...where, statusCode: { gte: 400 } } }),
      ]);
      const totalRequests = aggregate._count._all;
      const successfulRequests = totalRequests - errors;
      const averageLatency = aggregate._avg.latency ?? 0;

      return {
        projectId,
        range: { preset: timeRange.preset, from: timeRange.from.toISOString(), to: timeRange.to.toISOString() },
        metrics: {
          totalRequests,
          averageLatencyMs: round(averageLatency),
          errorCount: errors,
          successCount: successfulRequests,
          errorRate: totalRequests === 0 ? 0 : round((errors / totalRequests) * 100),
          successRate: totalRequests === 0 ? 0 : round((successfulRequests / totalRequests) * 100),
        },
      };
    },

    async traffic(userId, projectId, query) {
      const { timeRange } = await prepare(userId, projectId, query);
      const duration = timeRange.to.getTime() - timeRange.from.getTime();
      const bucket = TRAFFIC_BUCKETS.find((candidate) => duration <= candidate.maxDuration) ?? TRAFFIC_BUCKETS.at(-1)!;
      const rows = await db.$queryRaw<Array<{ bucket: Date; requestCount: bigint; averageLatency: number | null }>>(Prisma.sql`
        SELECT DATE_BIN(${bucket.interval}, "timestamp", TIMESTAMP '2000-01-01 00:00:00') AS bucket,
               COUNT(*)::bigint AS "requestCount",
               AVG("latency") AS "averageLatency"
        FROM "RequestLog"
        WHERE "projectId" = ${projectId}
          AND "timestamp" >= ${timeRange.from}
          AND "timestamp" < ${timeRange.to}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
      const values = new Map(rows.map((row) => [row.bucket.getTime(), row]));
      const firstBucket = Math.floor(timeRange.from.getTime() / bucket.milliseconds) * bucket.milliseconds;
      const data = [];
      for (let timestamp = firstBucket; timestamp < timeRange.to.getTime(); timestamp += bucket.milliseconds) {
        const row = values.get(timestamp);
        data.push({
          timestamp: new Date(timestamp).toISOString(),
          requestCount: row ? Number(row.requestCount) : 0,
          averageLatencyMs: row?.averageLatency == null ? 0 : round(Number(row.averageLatency)),
        });
      }

      return {
        projectId,
        range: { preset: timeRange.preset, from: timeRange.from.toISOString(), to: timeRange.to.toISOString() },
        interval: bucket.label,
        data,
      };
    },

    async statusCodes(userId, projectId, query) {
      const { timeRange, where } = await prepare(userId, projectId, query);
      const groups = await db.requestLog.groupBy({
        by: ["statusCode"],
        where,
        _count: { id: true },
        orderBy: { statusCode: "asc" },
      });
      const total = groups.reduce((sum, group) => sum + group._count.id, 0);
      return {
        projectId,
        range: { preset: timeRange.preset, from: timeRange.from.toISOString(), to: timeRange.to.toISOString() },
        data: groups.map((group) => ({
          statusCode: group.statusCode,
          count: group._count.id,
          percentage: total === 0 ? 0 : round((group._count.id / total) * 100),
        })),
      };
    },

    async topEndpoints(userId, projectId, query) {
      const { timeRange, where } = await prepare(userId, projectId, query);
      const groups = await db.requestLog.groupBy({
        by: ["method", "route"],
        where,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      });
      return {
        projectId,
        range: { preset: timeRange.preset, from: timeRange.from.toISOString(), to: timeRange.to.toISOString() },
        data: groups.map((group) => ({ method: group.method, route: group.route, requestCount: group._count.id })),
      };
    },

    async slowestEndpoints(userId, projectId, query) {
      const { timeRange, where } = await prepare(userId, projectId, query);
      const groups = await db.requestLog.groupBy({
        by: ["method", "route"],
        where,
        _avg: { latency: true },
        _count: { id: true },
        orderBy: { _avg: { latency: "desc" } },
        take: 10,
      });
      return {
        projectId,
        range: { preset: timeRange.preset, from: timeRange.from.toISOString(), to: timeRange.to.toISOString() },
        data: groups.map((group) => ({
          method: group.method,
          route: group.route,
          requestCount: group._count.id,
          averageLatencyMs: round(group._avg.latency ?? 0),
        })),
      };
    },

    async endpointErrors(userId, projectId, query) {
      const { timeRange } = await prepare(userId, projectId, query);
      const rows = await db.$queryRaw<Array<{ method: string; route: string; requestCount: bigint; errorCount: bigint }>>(Prisma.sql`
        SELECT "method", "route",
               COUNT(*)::bigint AS "requestCount",
               COUNT(*) FILTER (WHERE "statusCode" >= 400)::bigint AS "errorCount"
        FROM "RequestLog"
        WHERE "projectId" = ${projectId}
          AND "timestamp" >= ${timeRange.from}
          AND "timestamp" < ${timeRange.to}
        GROUP BY "method", "route"
        HAVING COUNT(*) FILTER (WHERE "statusCode" >= 400) > 0
        ORDER BY (COUNT(*) FILTER (WHERE "statusCode" >= 400)::double precision / COUNT(*)) DESC,
                 COUNT(*) FILTER (WHERE "statusCode" >= 400) DESC
        LIMIT 10
      `);
      return {
        projectId,
        range: { preset: timeRange.preset, from: timeRange.from.toISOString(), to: timeRange.to.toISOString() },
        data: rows.map((row) => {
          const requestCount = Number(row.requestCount);
          const errorCount = Number(row.errorCount);
          return {
            method: row.method,
            route: row.route,
            requestCount,
            errorCount,
            errorRate: round((errorCount / requestCount) * 100),
          };
        }),
      };
    },

    async recentRequests(userId, projectId, query) {
      const { timeRange, where } = await prepare(userId, projectId, query);
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const [total, requests] = await Promise.all([
        db.requestLog.count({ where }),
        db.requestLog.findMany({
          where,
          select: { id: true, method: true, route: true, statusCode: true, latency: true, timestamp: true },
          orderBy: [{ timestamp: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return {
        projectId,
        range: { preset: timeRange.preset, from: timeRange.from.toISOString(), to: timeRange.to.toISOString() },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        data: requests,
      };
    },
  };
}

export const analyticsService = createAnalyticsService();
