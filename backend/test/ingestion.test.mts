import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { after, before, test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/api_lens_test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-123456";
process.env.RABBITMQ_URL ??= "amqp://guest:guest@127.0.0.1:5672";

const [{ default: express }, { createIngestionRouter }, { errorHandler }, { AppError }, apiKeys, rabbit] = await Promise.all([
  import("express"),
  import("../src/routes/ingestion.routes.js"),
  import("../src/middleware/error-handler.js"),
  import("../src/utils/errors.js"),
  import("../src/services/apikey.service.js"),
  import("../src/services/rabbitmq.service.js"),
]);

const rawApiKey = `lens_${"a".repeat(64)}`;
const apiKeyHash = createHash("sha256").update(rawApiKey).digest("hex");
const storedKeys = new Map<string, { projectId: string; revokedAt: Date | null }>([
  [apiKeyHash, { projectId: "project-owned-by-key", revokedAt: null }],
]);
const validateApiKey = apiKeys.createApiKeyValidator(async (hash) => storedKeys.get(hash) ?? null);
const published: Array<Record<string, unknown>> = [];
let shouldFailPublish = false;

const app = express();
app.use(express.json({ limit: "16kb" }));
app.use("/ingest", createIngestionRouter({
  validateApiKey,
  publishTelemetry: async (message) => {
    if (shouldFailPublish) throw new Error("private broker details");
    published.push(message);
  },
}));
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

const event = {
  method: "GET",
  route: "/users/:userId",
  statusCode: 200,
  latency: 17,
  timestamp: "2026-11-13T10:00:00.000Z",
};

function send(body: unknown, token: string | null = rawApiKey) {
  return fetch(`${baseUrl}/ingest`, {
    method: "POST",
    headers: {
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("API-key validation hashes the presented key and rejects missing or revoked records", async () => {
  let lookedUpHash = "";
  const validator = apiKeys.createApiKeyValidator(async (hash) => {
    lookedUpHash = hash;
    return storedKeys.get(hash) ?? null;
  });
  assert.equal(await validator(rawApiKey), "project-owned-by-key");
  assert.equal(lookedUpHash, apiKeyHash);
  await assert.rejects(validator("lens_unknown"), (error: unknown) => error instanceof AppError && error.statusCode === 401);

  const revokedValidator = apiKeys.createApiKeyValidator(async () => ({
    projectId: "revoked-project",
    revokedAt: new Date(),
  }));
  await assert.rejects(revokedValidator(rawApiKey), (error: unknown) =>
    error instanceof AppError && error.code === "REVOKED_API_KEY",
  );
});

test("POST /ingest rejects absent, malformed, and invalid API keys", async () => {
  const noKey = await send(event, null);
  assert.equal(noKey.status, 401);

  const badKey = await send(event, "lens_not_registered");
  assert.equal(badKey.status, 401);

  const badScheme = await fetch(`${baseUrl}/ingest`, {
    method: "POST",
    headers: { authorization: rawApiKey, "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  assert.equal(badScheme.status, 401);
  assert.equal(published.length, 0);
});

test("POST /ingest validates a strict SDK event and rejects malformed JSON", async () => {
  const publishCount = published.length;
  const invalidEvents = [
    { ...event, statusCode: 99 },
    { ...event, latency: -1 },
    { ...event, route: "/users?token=secret" },
    { ...event, timestamp: "not-a-date" },
    { ...event, apiKey: rawApiKey },
    { ...event, projectId: "attacker-chosen-project" },
  ];

  for (const invalidEvent of invalidEvents) {
    const response = await send(invalidEvent);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  }

  const invalidJson = await fetch(`${baseUrl}/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${rawApiKey}`, "content-type": "application/json" },
    body: "{invalid json",
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, "INVALID_JSON");

  const oversized = await fetch(`${baseUrl}/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${rawApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ ...event, extra: "x".repeat(17_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "PAYLOAD_TOO_LARGE");
  assert.equal(published.length, publishCount);
});

test("valid telemetry is accepted and published with the API-key project's ID", async () => {
  const response = await send(event);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(published.at(-1), { ...event, projectId: "project-owned-by-key" });
});

test("Phase 4 SDK sends a completed Express request through POST /ingest to the queue publisher", async () => {
  const { apiLens } = await import("../../sdk/src/index.ts");
  const sampleApp = express();
  sampleApp.use(apiLens({ apiKey: rawApiKey, ingestionUrl: `${baseUrl}/ingest` }));
  sampleApp.get("/products/:productId", (req, res) => res.json({ productId: req.params.productId }));

  const sampleServer = sampleApp.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    sampleServer.once("listening", resolve);
    sampleServer.once("error", reject);
  });

  const publishCount = published.length;
  try {
    const address = sampleServer.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/products/private-product-id`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { productId: "private-product-id" });

    for (let attempt = 0; attempt < 50 && published.length === publishCount; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const message = published.at(-1);
    assert.equal(published.length, publishCount + 1);
    assert.equal(message?.projectId, "project-owned-by-key");
    assert.equal(message?.method, "GET");
    assert.equal(message?.route, "/products/:productId");
    assert.equal(message?.statusCode, 200);
    assert.equal(typeof message?.timestamp, "string");
    assert.equal(JSON.stringify(message).includes("private-product-id"), false);
  } finally {
    await new Promise<void>((resolve, reject) => sampleServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("queue failures return retryable 503 without leaking broker details", async () => {
  shouldFailPublish = true;
  try {
    const response = await send(event);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, "INGESTION_UNAVAILABLE");
    assert.equal(JSON.stringify(body).includes("private broker details"), false);
  } finally {
    shouldFailPublish = false;
  }
});

test("RabbitMQ publisher asserts a durable queue and awaits persistent message confirmation", async () => {
  const channel = Object.assign(new EventEmitter(), {
    asserted: undefined as unknown,
    sent: undefined as unknown,
    confirmed: false,
    async assertQueue(...args: unknown[]) { this.asserted = args; },
    sendToQueue(...args: unknown[]) { this.sent = args; return true; },
    async waitForConfirms() { this.confirmed = true; },
  });
  const connection = Object.assign(new EventEmitter(), {
    async createConfirmChannel() { return channel; },
  });
  const publish = rabbit.createTelemetryPublisher(async () => connection);
  const message = { ...event, projectId: "project-owned-by-key" };
  await publish(message);

  assert.deepEqual(channel.asserted, [rabbit.TELEMETRY_QUEUE, { durable: true }]);
  const [queue, body, options] = channel.sent as [string, Buffer, Record<string, unknown>];
  assert.equal(queue, rabbit.TELEMETRY_QUEUE);
  assert.deepEqual(JSON.parse(body.toString("utf8")), message);
  assert.equal(options.persistent, true);
  assert.equal(options.contentType, "application/json");
  assert.equal(channel.confirmed, true);
});

test("RabbitMQ publisher rejects a stalled confirmation and closes the unusable channel", async () => {
  const channel = Object.assign(new EventEmitter(), {
    closed: false,
    async assertQueue() {},
    sendToQueue() { return true; },
    waitForConfirms() { return new Promise<void>(() => undefined); },
    async close() {
      this.closed = true;
      this.emit("close");
    },
  });
  const connection = Object.assign(new EventEmitter(), {
    async createConfirmChannel() { return channel; },
    async close() { this.emit("close"); },
  });
  const publish = rabbit.createTelemetryPublisher(async () => connection, 10);

  await assert.rejects(publish({ ...event, projectId: "project-owned-by-key" }), /timed out/);
  assert.equal(channel.closed, true);
});
