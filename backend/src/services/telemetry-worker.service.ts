import amqp, { type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage, type SocketOptions } from "amqplib";
import { setTimeout as delay } from "node:timers/promises";
import { env } from "../config/env.js";
import { persistTelemetryEvent, type PersistResult } from "./request-log.service.js";
import { TELEMETRY_QUEUE } from "./rabbitmq.service.js";
import { telemetrySchema, type WorkerTelemetryMessage } from "../validators/telemetry.validators.js";
import { z } from "zod/v4";

export const TELEMETRY_RETRY_QUEUE = `${TELEMETRY_QUEUE}.retry`;
export const TELEMETRY_DEAD_QUEUE = `${TELEMETRY_QUEUE}.dead`;
export const WORKER_MAX_RETRIES = 5;
export const WORKER_RETRY_DELAY_MS = 5_000;
const MESSAGE_MAX_BYTES = 16 * 1024;
const BROKER_OPERATION_TIMEOUT_MS = 5_000;

const queuedTelemetrySchema = telemetrySchema.extend({
  projectId: z.uuid(),
  eventId: z.uuid().optional(), // Optional only for events already queued before idempotency was deployed.
}).strict();

type WorkerEvent = z.infer<typeof queuedTelemetrySchema>;
type WorkerLogger = Pick<Console, "info" | "warn" | "error">;
type Persist = (message: WorkerTelemetryMessage) => Promise<PersistResult>;

function messageHeaders(message: ConsumeMessage): Record<string, unknown> {
  return message.properties.headers ?? {};
}

function retryAttempt(message: ConsumeMessage): number {
  const value = messageHeaders(message)["x-api-lens-retry-attempt"];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs = BROKER_OPERATION_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("RabbitMQ operation timed out")), timeoutMs);
    timeout.unref?.();
    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

async function confirmForward(
  publisher: ConfirmChannel,
  queue: string,
  message: ConsumeMessage,
  headers: Record<string, unknown>,
): Promise<void> {
  const writable = publisher.sendToQueue(queue, message.content, {
    contentType: message.properties.contentType ?? "application/json",
    contentEncoding: message.properties.contentEncoding,
    correlationId: message.properties.correlationId,
    messageId: message.properties.messageId,
    persistent: true,
    headers,
  });
  if (!writable) await withTimeout(new Promise<void>((resolve) => publisher.once("drain", resolve)));
  await withTimeout(publisher.waitForConfirms());
}

function logContext(message: ConsumeMessage, projectId?: string): Record<string, unknown> {
  return {
    messageId: message.properties.messageId,
    projectId,
  };
}

/** Process a single delivery. Every ack follows either durable DB persistence or a confirmed retry/DLQ copy. */
export async function processTelemetryDelivery(
  message: ConsumeMessage,
  consumer: Pick<Channel, "ack" | "nack">,
  publisher: ConfirmChannel,
  persist: Persist = persistTelemetryEvent,
  logger: WorkerLogger = console,
  maxRetries = WORKER_MAX_RETRIES,
): Promise<void> {
  let event: WorkerEvent | undefined;
  if (message.content.byteLength <= MESSAGE_MAX_BYTES) {
    try {
      const parsed: unknown = JSON.parse(message.content.toString("utf8"));
      const validation = queuedTelemetrySchema.safeParse(parsed);
      if (validation.success) event = validation.data;
    } catch {
      // Invalid JSON is permanently rejected to the dead-letter queue below.
    }
  }

  if (!event) {
    try {
      await confirmForward(publisher, TELEMETRY_DEAD_QUEUE, message, {
        ...messageHeaders(message),
        "x-api-lens-dead-letter-reason": "invalid-telemetry-message",
      });
      consumer.ack(message);
      logger.warn("Invalid telemetry moved to dead-letter queue", logContext(message));
    } catch (error) {
      consumer.nack(message, false, true);
      logger.error("Could not dead-letter invalid telemetry; requeued", {
        ...logContext(message),
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return;
  }

  try {
    const result = await persist(event);
    consumer.ack(message);
    logger.info(result === "duplicate" ? "Duplicate telemetry acknowledged" : "Telemetry persisted", {
      ...logContext(message, event.projectId),
      eventId: event.eventId,
    });
    return;
  } catch (error) {
    const attempt = retryAttempt(message);
    const exhausted = attempt >= maxRetries;
    const queue = exhausted ? TELEMETRY_DEAD_QUEUE : TELEMETRY_RETRY_QUEUE;
    const headers = exhausted
      ? { ...messageHeaders(message), "x-api-lens-dead-letter-reason": "persistence-retries-exhausted" }
      : { ...messageHeaders(message), "x-api-lens-retry-attempt": attempt + 1 };

    try {
      await confirmForward(publisher, queue, message, headers);
      consumer.ack(message);
      logger[exhausted ? "error" : "warn"](exhausted ? "Telemetry moved to dead-letter queue after retries" : "Telemetry scheduled for retry", {
        ...logContext(message, event.projectId),
        attempt: exhausted ? attempt : attempt + 1,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    } catch (forwardError) {
      consumer.nack(message, false, true);
      logger.error("Could not forward failed telemetry; requeued original", {
        ...logContext(message, event.projectId),
        errorName: forwardError instanceof Error ? forwardError.name : "UnknownError",
      });
    }
  }
}

export interface WorkerOptions {
  persist?: Persist;
  logger?: WorkerLogger;
  connect?: (url: string, options?: SocketOptions) => Promise<ChannelModel>;
  retryDelayMs?: number;
  reconnectInitialDelayMs?: number;
  maxRetries?: number;
}

interface ConnectedWorker {
  closed: Promise<void>;
  close(): Promise<void>;
}

async function openConnectedWorker(options: Required<Pick<WorkerOptions, "persist" | "logger" | "connect" | "maxRetries" | "retryDelayMs">>): Promise<ConnectedWorker> {
  const connection = await options.connect(env.RABBITMQ_URL, { timeout: BROKER_OPERATION_TIMEOUT_MS });
  let consumer: Channel | undefined;
  let publisher: ConfirmChannel | undefined;
  let consumerTag: string | undefined;
  let stopping = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  const active = new Set<Promise<void>>();

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      if (consumer && consumerTag) await consumer.cancel(consumerTag);
    } catch {
      // The broker may already have closed the channel; outstanding deliveries are requeued on close.
    }
    await Promise.allSettled([...active]);
    await consumer?.close().catch(() => undefined);
    await publisher?.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
    resolveClosed();
  };

  try {
    consumer = await connection.createChannel();
    publisher = await connection.createConfirmChannel();
    await Promise.all([
      consumer.assertQueue(TELEMETRY_QUEUE, { durable: true }),
      publisher.assertQueue(TELEMETRY_QUEUE, { durable: true }),
      publisher.assertQueue(TELEMETRY_DEAD_QUEUE, { durable: true }),
      publisher.assertQueue(TELEMETRY_RETRY_QUEUE, {
        durable: true,
        arguments: {
          "x-message-ttl": options.retryDelayMs ?? WORKER_RETRY_DELAY_MS,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": TELEMETRY_QUEUE,
        },
      }),
    ]);
    await consumer.prefetch(10);

    connection.on("close", resolveClosed);
    connection.on("error", (error) => {
      options.logger.error("RabbitMQ worker connection failed", { errorName: error.name });
      resolveClosed();
    });
    consumer.on("close", resolveClosed);
    consumer.on("error", (error) => {
      options.logger.error("RabbitMQ worker consumer channel failed", { errorName: error.name });
      resolveClosed();
    });
    publisher.on("close", resolveClosed);
    publisher.on("error", (error) => {
      options.logger.error("RabbitMQ worker publisher channel failed", { errorName: error.name });
      resolveClosed();
    });

    const result = await consumer.consume(TELEMETRY_QUEUE, (message) => {
      if (!message || !consumer || !publisher || stopping) return;
      const task = processTelemetryDelivery(message, consumer, publisher, options.persist, options.logger, options.maxRetries)
        .catch((error: unknown) => {
          options.logger.error("Unexpected telemetry worker failure", {
            ...logContext(message),
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          try { consumer?.nack(message, false, true); } catch { /* channel closed; broker requeues unacked delivery */ }
        });
      active.add(task);
      void task.finally(() => active.delete(task));
    }, { noAck: false });
    consumerTag = result.consumerTag;
  } catch (error) {
    await stop();
    throw error;
  }

  return { closed, close: stop };
}

export interface TelemetryWorkerHandle {
  close(): Promise<void>;
}

/** Start consuming and keep reconnecting with capped backoff until close() is called. */
export function startTelemetryWorker(workerOptions: WorkerOptions = {}): TelemetryWorkerHandle {
  const options = {
    persist: workerOptions.persist ?? persistTelemetryEvent,
    logger: workerOptions.logger ?? console,
    connect: workerOptions.connect ?? ((url: string, socketOptions?: SocketOptions) => amqp.connect(url, socketOptions)),
    retryDelayMs: workerOptions.retryDelayMs ?? WORKER_RETRY_DELAY_MS,
    maxRetries: workerOptions.maxRetries ?? WORKER_MAX_RETRIES,
  };
  let stopping = false;
  let current: ConnectedWorker | undefined;
  let wakeReconnect: (() => void) | undefined;
  const reconnectInitialDelayMs = workerOptions.reconnectInitialDelayMs ?? 1_000;

  const loop = (async () => {
    let backoffMs = reconnectInitialDelayMs;
    while (!stopping) {
      try {
        current = await openConnectedWorker(options);
        options.logger.info("RabbitMQ telemetry worker connected", { queue: TELEMETRY_QUEUE });
        backoffMs = reconnectInitialDelayMs;
        if (stopping) await current.close();
        else await current.closed;
      } catch (error) {
        options.logger.error("RabbitMQ telemetry worker connection failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }

      if (current) {
        await current.close();
        current = undefined;
      }
      if (stopping) break;

      options.logger.warn("RabbitMQ telemetry worker reconnect scheduled", { delayMs: backoffMs });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, backoffMs);
        wakeReconnect = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wakeReconnect = undefined;
      backoffMs = Math.min(backoffMs * 2, 30_000);
    }
  })();

  return {
    async close() {
      stopping = true;
      wakeReconnect?.();
      await current?.close();
      await loop;
    },
  };
}
