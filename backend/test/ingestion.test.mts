import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { after, before, test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/api_lens_test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-123456";
process.env.RABBITMQ_URL ??= "amqp://guest:guest@127.0.0.1:5672";

const [{ default: express }, { createIngestionRouter }, { errorHandler }, { AppError }, apiKeys, rabbit, worker, requestLogs, prismaClient] = await Promise.all([
  import("express"),
  import("../src/routes/ingestion.routes.js"),
  import("../src/middleware/error-handler.js"),
  import("../src/utils/errors.js"),
  import("../src/services/apikey.service.js"),
  import("../src/services/rabbitmq.service.js"),
  import("../src/services/telemetry-worker.service.js"),
  import("../src/services/request-log.service.js"),
  import("@prisma/client"),
]);

const rawApiKey = `lens_${"a".repeat(64)}`;
const apiKeyHash = createHash("sha256").update(rawApiKey).digest("hex");
const storedKeys = new Map<string, { projectId: string; revokedAt: Date | null }>([
  [apiKeyHash, { projectId: "c9fdddb5-6dae-4458-8350-27024161ac4a", revokedAt: null }],
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
  assert.equal(await validator(rawApiKey), "c9fdddb5-6dae-4458-8350-27024161ac4a");
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
  assert.deepEqual(published.at(-1), {
    ...event,
    eventId: published.at(-1)?.eventId,
    projectId: "c9fdddb5-6dae-4458-8350-27024161ac4a",
  });
  assert.match(String(published.at(-1)?.eventId), /^[0-9a-f-]{36}$/i);
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
    assert.equal(message?.projectId, "c9fdddb5-6dae-4458-8350-27024161ac4a");
    assert.match(String(message?.eventId), /^[0-9a-f-]{36}$/i);
    assert.equal(message?.method, "GET");
    assert.equal(message?.route, "/products/:productId");
    assert.equal(message?.statusCode, 200);
    assert.equal(typeof message?.timestamp, "string");
    assert.equal(JSON.stringify(message).includes("private-product-id"), false);

    let prismaCreateArgs: Record<string, unknown> | undefined;
    const persist = requestLogs.createRequestLogPersister(async (args: Record<string, unknown>) => {
      prismaCreateArgs = args;
    });
    const workerConsumer = makeConsumer();
    await worker.processTelemetryDelivery(
      makeDelivery(message),
      workerConsumer,
      makeForwarder(),
      persist,
      quietLogger,
    );
    assert.equal(workerConsumer.calls[0]?.method, "ack");
    const persistedData = (prismaCreateArgs?.data ?? {}) as Record<string, unknown>;
    assert.equal(persistedData.eventId, message?.eventId);
    assert.equal(persistedData.projectId, message?.projectId);
    assert.equal(persistedData.route, "/products/:productId");
    assert.ok(persistedData.timestamp instanceof Date);
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
  const message = { ...event, eventId: "e9638412-1805-4b61-8000-c75a2c065435", projectId: "c9fdddb5-6dae-4458-8350-27024161ac4a" };
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

  await assert.rejects(publish({ ...event, projectId: "c9fdddb5-6dae-4458-8350-27024161ac4a" }), /timed out/);
  assert.equal(channel.closed, true);
});

const validWorkerMessage = {
  ...event,
  eventId: "e9638412-1805-4b61-8000-c75a2c065435",
  projectId: "c9fdddb5-6dae-4458-8350-27024161ac4a",
};

function makeDelivery(body: unknown, headers: Record<string, unknown> = {}) {
  return {
    content: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
    properties: { headers, messageId: validWorkerMessage.eventId, contentType: "application/json" },
    fields: { deliveryTag: 1, redelivered: false },
  };
}

function makeConsumer() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    ack(...args: unknown[]) { calls.push({ method: "ack", args }); },
    nack(...args: unknown[]) { calls.push({ method: "nack", args }); },
  };
}

function makeForwarder({ failConfirm = false } = {}) {
  return Object.assign(new EventEmitter(), {
    messages: [] as Array<{ queue: string; body: Buffer; options: Record<string, unknown> }>,
    sendToQueue(queue: string, body: Buffer, options: Record<string, unknown>) {
      this.messages.push({ queue, body, options });
      return true;
    },
    async waitForConfirms() {
      if (failConfirm) throw new Error("broker unavailable");
    },
  });
}

const quietLogger = { info() {}, warn() {}, error() {} };

test("worker persists valid messages before acknowledging and acknowledges idempotent duplicates", async () => {
  const delivery = makeDelivery(validWorkerMessage);
  const consumer = makeConsumer();
  let finishPersist!: (result: "stored") => void;
  const persist = () => new Promise<"stored">((resolve) => { finishPersist = resolve; });
  const processing = worker.processTelemetryDelivery(delivery, consumer, makeForwarder(), persist, quietLogger);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(consumer.calls.length, 0);
  finishPersist("stored");
  await processing;
  assert.equal(consumer.calls[0]?.method, "ack");

  const duplicateConsumer = makeConsumer();
  await worker.processTelemetryDelivery(
    makeDelivery(validWorkerMessage),
    duplicateConsumer,
    makeForwarder(),
    async () => "duplicate",
    quietLogger,
  );
  assert.equal(duplicateConsumer.calls[0]?.method, "ack");
});

test("worker dead-letters invalid messages and retries database failures with confirmed copies", async () => {
  const deadConsumer = makeConsumer();
  const deadForwarder = makeForwarder();
  await worker.processTelemetryDelivery(makeDelivery({ ...validWorkerMessage, statusCode: 700 }), deadConsumer, deadForwarder, async () => "stored", quietLogger);
  assert.equal(deadForwarder.messages[0]?.queue, worker.TELEMETRY_DEAD_QUEUE);
  assert.equal(deadConsumer.calls[0]?.method, "ack");

  const retryConsumer = makeConsumer();
  const retryForwarder = makeForwarder();
  await worker.processTelemetryDelivery(
    makeDelivery(validWorkerMessage), retryConsumer, retryForwarder,
    async () => { throw new Error("database unavailable"); }, quietLogger,
  );
  assert.equal(retryForwarder.messages[0]?.queue, worker.TELEMETRY_RETRY_QUEUE);
  assert.equal(retryForwarder.messages[0]?.options.headers["x-api-lens-retry-attempt"], 1);
  assert.equal(retryConsumer.calls[0]?.method, "ack");
});

test("worker sends exhausted retries to the dead-letter queue and requeues if forwarding fails", async () => {
  const exhaustedConsumer = makeConsumer();
  const exhaustedForwarder = makeForwarder();
  await worker.processTelemetryDelivery(
    makeDelivery(validWorkerMessage, { "x-api-lens-retry-attempt": worker.WORKER_MAX_RETRIES }),
    exhaustedConsumer, exhaustedForwarder,
    async () => { throw new Error("database unavailable"); }, quietLogger,
  );
  assert.equal(exhaustedForwarder.messages[0]?.queue, worker.TELEMETRY_DEAD_QUEUE);

  const retryConsumer = makeConsumer();
  await worker.processTelemetryDelivery(
    makeDelivery(validWorkerMessage), retryConsumer, makeForwarder({ failConfirm: true }),
    async () => { throw new Error("database unavailable"); }, quietLogger,
  );
  assert.equal(retryConsumer.calls[0]?.method, "nack");
  assert.deepEqual(retryConsumer.calls[0]?.args.slice(1), [false, true]);
});

test("RequestLog persistence stores timestamps and treats an event ID unique conflict as a duplicate", async () => {
  let createArgs: Record<string, unknown> | undefined;
  const persist = requestLogs.createRequestLogPersister(async (args: Record<string, unknown>) => {
    createArgs = args;
  });
  assert.equal(await persist(validWorkerMessage), "stored");
  const createData = (createArgs?.data ?? {}) as Record<string, unknown>;
  assert.equal(createData.eventId, validWorkerMessage.eventId);
  assert.equal(createData.projectId, validWorkerMessage.projectId);
  assert.ok(createData.timestamp instanceof Date);

  const conflict = new prismaClient.Prisma.PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["eventId"] },
  });
  const duplicatePersist = requestLogs.createRequestLogPersister(async () => { throw conflict; });
  assert.equal(await duplicatePersist(validWorkerMessage), "duplicate");
});

test("worker reconnects after broker failures and gracefully cancels its consumer", async () => {
  const connections: Array<ReturnType<typeof makeWorkerConnection>> = [];
  let connectAttempts = 0;
  const workerHandle = worker.startTelemetryWorker({
    persist: async () => "stored",
    logger: quietLogger,
    reconnectInitialDelayMs: 5,
    retryDelayMs: 5,
    connect: async () => {
      connectAttempts += 1;
      if (connectAttempts === 1) throw new Error("broker unavailable at startup");
      const connection = makeWorkerConnection();
      connections.push(connection);
      return connection as never;
    },
  });

  try {
    for (let attempt = 0; attempt < 100 && connections.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(connections.length, 1);
    assert.ok(connections[0].consumer.consumeCallback);
    assert.equal(connections[0].consumer.prefetchValue, 10);
    assert.equal(connections[0].consumer.consumeOptions?.noAck, false);
    assert.ok(connections[0].publisher.assertions.some(({ queue, options }) => queue === worker.TELEMETRY_DEAD_QUEUE && options.durable === true));
    const retryQueue = connections[0].publisher.assertions.find(({ queue }) => queue === worker.TELEMETRY_RETRY_QUEUE);
    assert.equal(retryQueue?.options.arguments?.["x-message-ttl"], 5);
    assert.equal(retryQueue?.options.arguments?.["x-dead-letter-routing-key"], rabbit.TELEMETRY_QUEUE);

    connections[0].emit("close");
    for (let attempt = 0; attempt < 100 && connections.length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(connections.length, 2);
  } finally {
    await workerHandle.close();
  }

  assert.equal(connections[1].consumer.cancelled, true);
  assert.equal(connections[1].closed, true);
});

function makeWorkerConnection() {
  const consumer = Object.assign(new EventEmitter(), {
    cancelled: false,
    consumeCallback: undefined as ((message: unknown) => void) | undefined,
    assertions: [] as Array<{ queue: string; options: Record<string, unknown> }>,
    prefetchValue: 0,
    consumeOptions: undefined as Record<string, unknown> | undefined,
    async assertQueue(queue: string, options: Record<string, unknown>) { this.assertions.push({ queue, options }); },
    async prefetch(value: number) { this.prefetchValue = value; },
    async consume(_queue: string, callback: (message: unknown) => void, options: Record<string, unknown>) {
      this.consumeCallback = callback;
      this.consumeOptions = options;
      return { consumerTag: "api-lens-test-consumer" };
    },
    async cancel() { this.cancelled = true; },
    ack() {},
    nack() {},
    async close() { this.emit("close"); },
  });
  const publisher = Object.assign(new EventEmitter(), {
    assertions: [] as Array<{ queue: string; options: Record<string, unknown> }>,
    async assertQueue(queue: string, options: Record<string, unknown>) { this.assertions.push({ queue, options }); },
    sendToQueue() { return true; },
    async waitForConfirms() {},
    async close() { this.emit("close"); },
  });
  return Object.assign(new EventEmitter(), {
    consumer,
    publisher,
    closed: false,
    async createChannel() { return consumer; },
    async createConfirmChannel() { return publisher; },
    async close() {
      this.closed = true;
      this.emit("close");
    },
  });
}
