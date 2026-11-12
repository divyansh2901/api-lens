import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/api_lens_test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-123456";
process.env.RABBITMQ_URL ??= "amqp://guest:guest@127.0.0.1:5672";

const [{ default: express }, { createAnalyticsRouter }, { createAnalyticsService }, { AppError }, { errorHandler }] = await Promise.all([
  import("express"),
  import("../src/routes/analytics.routes.js"),
  import("../src/services/analytics.service.js"),
  import("../src/utils/errors.js"),
  import("../src/middleware/error-handler.js"),
]);

const ownerProjectId = "c9fdddb5-6dae-4458-8350-27024161ac4a";
const fixedNow = new Date("2026-11-13T12:00:00.000Z");
const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
let denyOwnership = false;

const db = {
  requestLog: {
    async aggregate(args: Record<string, unknown>) {
      calls.push({ method: "aggregate", args });
      return { _count: { _all: 4 }, _avg: { latency: 125.567 } };
    },
    async count(args: Record<string, unknown>) {
      calls.push({ method: "count", args });
      const where = args.where as Record<string, unknown>;
      return where.statusCode ? 1 : 42;
    },
    async groupBy(args: Record<string, unknown>) {
      calls.push({ method: "groupBy", args });
      const by = args.by as string[];
      if (by.includes("statusCode")) {
        return [
          { statusCode: 200, _count: { id: 3 } },
          { statusCode: 500, _count: { id: 1 } },
        ];
      }
      if (args._avg) {
        return [
          { method: "GET", route: "/slow", _avg: { latency: 450.126 }, _count: { id: 2 } },
        ];
      }
      return [
        { method: "GET", route: "/popular", _count: { id: 7 } },
        { method: "POST", route: "/popular", _count: { id: 3 } },
      ];
    },
    async findMany(args: Record<string, unknown>) {
      calls.push({ method: "findMany", args });
      return [{ id: "request-1", method: "GET", route: "/recent", statusCode: 200, latency: 32, timestamp: fixedNow }];
    },
  },
  async $queryRaw(query: { sql: string }) {
    calls.push({ method: "queryRaw", args: { sql: query.sql } });
    if (query.sql.includes("DATE_BIN")) {
      return [{ bucket: new Date("2026-11-13T11:30:00.000Z"), requestCount: 3n, averageLatency: 90 }];
    }
    return [{ method: "GET", route: "/failing", requestCount: 3n, errorCount: 2n }];
  },
};

const service = createAnalyticsService({
  db: db as never,
  now: () => new Date(fixedNow),
  ensureOwnership: async (userId, projectId) => {
    if (denyOwnership || userId !== "owner" || projectId !== ownerProjectId) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
  },
});

const app = express();
const testAuth = (req: { headers: { authorization?: string }; userId?: string }, _res: unknown, next: (error?: unknown) => void) => {
  if (req.headers.authorization !== "Bearer test-user-token") {
    next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    return;
  }
  req.userId = "owner";
  next();
};
app.use("/api/analytics", createAnalyticsRouter(service, testAuth as never));
app.use(errorHandler);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function get(path: string, token = "test-user-token") {
  return fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
}

test("analytics endpoints require JWT authentication and enforce project ownership", async () => {
  const unauthenticated = await get(`/api/analytics/${ownerProjectId}/overview`, "missing");
  assert.equal(unauthenticated.status, 401);

  denyOwnership = true;
  const forbidden = await get(`/api/analytics/${ownerProjectId}/overview`);
  denyOwnership = false;
  assert.equal(forbidden.status, 404);
  assert.equal((await forbidden.json()).error.code, "PROJECT_NOT_FOUND");
  assert.equal(calls.length, 0);
});

test("overview reports request totals, average latency, error rate, and success rate", async () => {
  const response = await get(`/api/analytics/${ownerProjectId}/overview?range=1h`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data.metrics, {
    totalRequests: 4,
    averageLatencyMs: 125.57,
    errorCount: 1,
    successCount: 3,
    errorRate: 25,
    successRate: 75,
  });
  const aggregateCall = calls.find((call) => call.method === "aggregate");
  const where = aggregateCall?.args.where as Record<string, unknown>;
  assert.equal(where.projectId, ownerProjectId);
  assert.equal((where.timestamp as Record<string, unknown>).gte?.toISOString(), "2026-11-13T11:00:00.000Z");
  assert.equal((where.timestamp as Record<string, unknown>).lt?.toISOString(), fixedNow.toISOString());
});

test("traffic returns zero-filled time buckets and status distribution is grouped", async () => {
  const traffic = await get(`/api/analytics/${ownerProjectId}/traffic?range=1h`);
  const trafficBody = await traffic.json();
  assert.equal(trafficBody.data.interval, "1 minute");
  assert.equal(trafficBody.data.data.length, 60);
  assert.deepEqual(trafficBody.data.data.find((point: { requestCount: number }) => point.requestCount === 3), {
    timestamp: "2026-11-13T11:30:00.000Z",
    requestCount: 3,
    averageLatencyMs: 90,
  });
  assert.equal(trafficBody.data.data.filter((point: { requestCount: number }) => point.requestCount === 0).length, 59);

  const statuses = await get(`/api/analytics/${ownerProjectId}/status-codes?range=24h`);
  const statusData = (await statuses.json()).data.data;
  assert.deepEqual(statusData, [
    { statusCode: 200, count: 3, percentage: 75 },
    { statusCode: 500, count: 1, percentage: 25 },
  ]);
});

test("endpoint rankings and error-rate analytics use grouped database results", async () => {
  const top = await get(`/api/analytics/${ownerProjectId}/top-endpoints?range=7d`);
  assert.deepEqual((await top.json()).data.data[0], { method: "GET", route: "/popular", requestCount: 7 });

  const slowest = await get(`/api/analytics/${ownerProjectId}/slowest-endpoints?range=30d`);
  assert.deepEqual((await slowest.json()).data.data[0], {
    method: "GET", route: "/slow", requestCount: 2, averageLatencyMs: 450.13,
  });

  const failures = await get(`/api/analytics/${ownerProjectId}/endpoint-errors?range=24h`);
  assert.deepEqual((await failures.json()).data.data[0], {
    method: "GET", route: "/failing", requestCount: 3, errorCount: 2, errorRate: 66.67,
  });
});

test("recent requests paginate and empty datasets return zero metrics", async () => {
  const response = await get(`/api/analytics/${ownerProjectId}/recent-requests?page=2&limit=10&range=24h`);
  const body = (await response.json()).data;
  assert.deepEqual(body.pagination, { page: 2, limit: 10, total: 42, totalPages: 5 });
  const findMany = calls.filter((call) => call.method === "findMany").at(-1)?.args;
  assert.equal(findMany?.skip, 10);
  assert.equal(findMany?.take, 10);

  const emptyService = createAnalyticsService({
    db: {
      requestLog: {
        aggregate: async () => ({ _count: { _all: 0 }, _avg: { latency: null } }),
        count: async () => 0,
        groupBy: async () => [],
        findMany: async () => [],
      },
      $queryRaw: async () => [],
    } as never,
    ensureOwnership: async () => undefined,
    now: () => new Date(fixedNow),
  });
  const empty = await emptyService.overview("owner", ownerProjectId, { range: "1h" });
  assert.deepEqual(empty.metrics, {
    totalRequests: 0,
    averageLatencyMs: 0,
    errorCount: 0,
    successCount: 0,
    errorRate: 0,
    successRate: 0,
  });
  const [emptyTraffic, emptyStatuses, emptyErrors, emptyRecent] = await Promise.all([
    emptyService.traffic("owner", ownerProjectId, { range: "1h" }),
    emptyService.statusCodes("owner", ownerProjectId, { range: "1h" }),
    emptyService.endpointErrors("owner", ownerProjectId, { range: "1h" }),
    emptyService.recentRequests("owner", ownerProjectId, { range: "1h" }),
  ]);
  assert.equal(emptyTraffic.data.every((point: { requestCount: number }) => point.requestCount === 0), true);
  assert.deepEqual(emptyStatuses.data, []);
  assert.deepEqual(emptyErrors.data, []);
  assert.deepEqual(emptyRecent.pagination, { page: 1, limit: 20, total: 0, totalPages: 0 });
  assert.deepEqual(emptyRecent.data, []);
});

test("time range and pagination inputs reject invalid or excessive values", async () => {
  const malformed = await get(`/api/analytics/${ownerProjectId}/overview?range=5m`);
  assert.equal(malformed.status, 400);
  const halfRange = await get(`/api/analytics/${ownerProjectId}/overview?from=2026-11-13T10:00:00.000Z`);
  assert.equal(halfRange.status, 400);
  const reversed = await get(`/api/analytics/${ownerProjectId}/overview?from=2026-11-13T11:00:00.000Z&to=2026-11-13T10:00:00.000Z`);
  assert.equal(reversed.status, 400);
  const tooWide = await get(`/api/analytics/${ownerProjectId}/overview?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z`);
  assert.equal(tooWide.status, 400);
  const futureEnd = await get(`/api/analytics/${ownerProjectId}/overview?from=2026-11-20T10:00:00.000Z&to=2026-11-21T10:00:00.000Z`);
  assert.equal(futureEnd.status, 400);
  const invalidPage = await get(`/api/analytics/${ownerProjectId}/recent-requests?page=0&limit=1000`);
  assert.equal(invalidPage.status, 400);
});
