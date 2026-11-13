import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/api_lens_test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-123456";
process.env.RABBITMQ_URL ??= "amqp://guest:guest@127.0.0.1:5672";

const [{ default: express }, { createAnalyticsRouter }, { createAiService, createGeminiGenerator, mapGeminiError }, { createAiRateLimit }, { AppError }, { errorHandler }] = await Promise.all([
  import("express"), import("../src/routes/analytics.routes.js"), import("../src/services/ai.service.js"),
  import("../src/middleware/ai-rate-limit.js"), import("../src/utils/errors.js"), import("../src/middleware/error-handler.js"),
]);

const projectId = "c9fdddb5-6dae-4458-8350-27024161ac4a";
const now = new Date("2026-11-13T12:00:00.000Z");
const summary = {
  executiveSummary: "Requests are healthy overall with a slower report endpoint.",
  observations: [{ category: "latency", title: "Slow report route", fact: "GET /reports averages 850 ms", evidence: "Average latency is 850 ms across 20 requests" }],
  possibleExplanations: ["The route may perform expensive work; request traces are not available."],
  recommendations: [{ action: "Profile GET /reports", rationale: "It has the highest observed average latency." }],
};
const answer = { answer: "The report endpoint is slowest in the selected range.", observedFacts: ["GET /reports averages 850 ms across 20 requests."], possibleExplanations: ["It may be doing expensive work."], recommendations: ["Profile the report handler and its database calls."] };

function makeAnalytics(totalRequests = 12, ensureOwnership: () => Promise<void> = async () => undefined) {
  const range = { preset: "24h", from: "2026-11-12T12:00:00.000Z", to: now.toISOString() };
  return {
    async overview() { await ensureOwnership(); return { range, metrics: { totalRequests, averageLatencyMs: 225, errorCount: 3, successCount: totalRequests - 3, errorRate: 25, successRate: 75 } }; },
    async traffic() { await ensureOwnership(); return { data: [{ timestamp: "2026-11-13T11:00:00.000Z", requestCount: 3, averageLatencyMs: 200 }, { timestamp: "2026-11-13T12:00:00.000Z", requestCount: 12, averageLatencyMs: 500 }] }; },
    async statusCodes() { await ensureOwnership(); return { data: [{ statusCode: 500, count: 3, percentage: 25 }, { statusCode: 200, count: 9, percentage: 75 }] }; },
    async topEndpoints() { await ensureOwnership(); return { data: [{ method: "GET", route: "/reports", requestCount: 20 }] }; },
    async slowestEndpoints() { await ensureOwnership(); return { data: [{ method: "GET", route: "/reports", requestCount: 20, averageLatencyMs: 850 }] }; },
    async endpointErrors() { await ensureOwnership(); return { data: [{ method: "POST", route: "/payments", requestCount: 4, errorCount: 3, errorRate: 75 }] }; },
  } as never;
}

const generatorCalls: Array<{ prompt: string; schema: object }> = [];
const generator = { async generate(prompt: string, schema: object) { generatorCalls.push({ prompt, schema }); return JSON.stringify(prompt.includes("user's question") ? answer : summary); } };
const auth = (req: { headers: { authorization?: string }; userId?: string }, _res: unknown, next: (error?: unknown) => void) => {
  if (req.headers.authorization !== "Bearer ai-test-token") { next(new AppError(401, "UNAUTHORIZED", "Authentication required")); return; }
  req.userId = "owner"; next();
};
const app = express();
app.use(express.json({ limit: "16kb" }));
const ai = createAiService({ analytics: makeAnalytics() as never, generator, now: () => now });
app.use("/api/analytics", createAnalyticsRouter(undefined, auth as never, ai));
app.use(errorHandler);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address !== "string"); baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test("insight endpoint requires auth and returns fact-separated structured recommendations", async () => {
  const denied = await fetch(`${baseUrl}/api/analytics/${projectId}/insights`);
  assert.equal(denied.status, 401);
  const response = await fetch(`${baseUrl}/api/analytics/${projectId}/insights?range=7d`, { headers: { authorization: "Bearer ai-test-token" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.observations[0].fact, summary.observations[0].fact);
  assert.equal(body.data.possibleExplanations[0], summary.possibleExplanations[0]);
  assert.equal(body.data.recommendations[0].action, summary.recommendations[0].action);
  assert.equal(generatorCalls.at(-1)?.prompt.includes("850"), true);
  assert.equal(generatorCalls.at(-1)?.prompt.includes("authorization"), false);
});

test("ask endpoint validates range and question, then answers from analytics only", async () => {
  const invalid = await fetch(`${baseUrl}/api/analytics/${projectId}/ask?range=5m`, { method: "POST", headers: { authorization: "Bearer ai-test-token", "content-type": "application/json" }, body: JSON.stringify({ question: "What is slow?" }) });
  assert.equal(invalid.status, 400);
  const tooShort = await fetch(`${baseUrl}/api/analytics/${projectId}/ask`, { method: "POST", headers: { authorization: "Bearer ai-test-token", "content-type": "application/json" }, body: JSON.stringify({ question: "?" }) });
  assert.equal(tooShort.status, 400);
  const response = await fetch(`${baseUrl}/api/analytics/${projectId}/ask?range=24h`, { method: "POST", headers: { authorization: "Bearer ai-test-token", "content-type": "application/json" }, body: JSON.stringify({ question: "Which endpoint is slowest?" }) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body.data.observedFacts, answer.observedFacts);
  assert.deepEqual(body.data.possibleExplanations, answer.possibleExplanations);
  assert.deepEqual(body.data.recommendations, answer.recommendations);
});

test("AI generation is skipped for empty analytics and denied projects never reach Gemini", async () => {
  let calls = 0;
  const emptyAi = createAiService({ analytics: makeAnalytics(0) as never, generator: { async generate() { calls += 1; return "{}"; } }, now: () => now });
  const empty = await emptyAi.insights("owner", projectId, { range: "1h" });
  assert.equal(empty.observations && (empty.observations as unknown[]).length, 0);
  assert.equal(calls, 0);

  let generationCalls = 0;
  const deniedAi = createAiService({ analytics: makeAnalytics(12, async () => { throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found"); }) as never, generator: { async generate() { generationCalls += 1; return JSON.stringify(summary); } } });
  await assert.rejects(deniedAi.insights("other", projectId, { range: "1h" }), /Project not found/);
  assert.equal(generationCalls, 0);
});

test("AI output is schema-validated and provider failures map to safe HTTP errors", async () => {
  const malformedAi = createAiService({ analytics: makeAnalytics() as never, generator: { async generate() { return "not json"; } } });
  await assert.rejects(malformedAi.insights("owner", projectId, { range: "1h" }), (error: unknown) => error instanceof AppError && error.statusCode === 502 && error.code === "AI_INVALID_RESPONSE");
  assert.equal(mapGeminiError({ status: 429, message: "quota exceeded" }).statusCode, 429);
  assert.equal(mapGeminiError({ status: 408, message: "deadline" }).statusCode, 504);
  const originalError = console.error; console.error = () => undefined;
  try {
    assert.equal(mapGeminiError({ status: 403, message: "denied" }).statusCode, 503);
    assert.equal(mapGeminiError({ status: 500, message: "failure" }).statusCode, 502);
  } finally { console.error = originalError; }
  await assert.rejects(createGeminiGenerator(undefined).generate("prompt", {}), (error: unknown) => error instanceof AppError && error.statusCode === 503 && error.code === "AI_NOT_CONFIGURED");
});

test("AI endpoints enforce a per-user request budget", async () => {
  let time = 1000;
  const limiter = createAiRateLimit({ limit: 1, windowMs: 60_000, now: () => time });
  const limitedApp = express();
  limitedApp.use("/api/analytics", createAnalyticsRouter(undefined, auth as never, ai, limiter));
  limitedApp.use(errorHandler);
  const limitedServer = limitedApp.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => limitedServer.once("listening", resolve));
  const address = limitedServer.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/analytics/${projectId}/insights`;
  assert.equal((await fetch(url, { headers: { authorization: "Bearer ai-test-token" } })).status, 200);
  const blocked = await fetch(url, { headers: { authorization: "Bearer ai-test-token" } });
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get("retry-after"), "60");
  time += 60_001;
  assert.equal((await fetch(url, { headers: { authorization: "Bearer ai-test-token" } })).status, 200);
  await new Promise<void>((resolve, reject) => limitedServer.close(error => error ? reject(error) : resolve()));
});
