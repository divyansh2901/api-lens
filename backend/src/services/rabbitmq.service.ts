import amqp, { type ChannelModel, type ConfirmChannel, type SocketOptions } from "amqplib";
import { once } from "node:events";
import { env } from "../config/env.js";
import type { TelemetryMessage } from "../validators/telemetry.validators.js";

export const TELEMETRY_QUEUE = "api-lens.telemetry";

type Connect = (url: string) => Promise<ChannelModel>;
const CONNECT_TIMEOUT_MS = 5_000;
const CONFIRM_TIMEOUT_MS = 5_000;

function waitForConfirm(channel: ConfirmChannel, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("RabbitMQ publish confirmation timed out")), timeoutMs);
    timeout.unref?.();
    channel.waitForConfirms().then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

/**
 * Build a lazy, reusable publisher. Confirm channels make the API respond only
 * after RabbitMQ confirms the durable message was accepted.
 */
export function createTelemetryPublisher(
  connect: Connect = (url) => amqp.connect(url, { timeout: CONNECT_TIMEOUT_MS } as SocketOptions),
  confirmTimeoutMs = CONFIRM_TIMEOUT_MS,
) {
  let channelPromise: Promise<ConfirmChannel> | undefined;
  let connection: ChannelModel | undefined;

  const getChannel = (): Promise<ConfirmChannel> => {
    if (channelPromise) return channelPromise;

    channelPromise = (async () => {
      const activeConnection = await connect(env.RABBITMQ_URL);
      connection = activeConnection;
      const channel = await activeConnection.createConfirmChannel();
      await channel.assertQueue(TELEMETRY_QUEUE, { durable: true });

      const reset = () => {
        if (connection === activeConnection) {
          connection = undefined;
          channelPromise = undefined;
          void activeConnection.close().catch(() => undefined);
        }
      };
      activeConnection.on("close", reset);
      activeConnection.on("error", reset);
      channel.on("close", reset);
      channel.on("error", reset);
      return channel;
    })().catch((error: unknown) => {
      channelPromise = undefined;
      connection = undefined;
      throw error;
    });

    return channelPromise;
  };

  return async (message: TelemetryMessage): Promise<void> => {
    const channel = await getChannel();
    const writable = channel.sendToQueue(
      TELEMETRY_QUEUE,
      Buffer.from(JSON.stringify(message)),
      {
        contentType: "application/json",
        persistent: true,
      },
    );

    if (!writable) await once(channel, "drain");
    try {
      await waitForConfirm(channel, confirmTimeoutMs);
    } catch (error) {
      await channel.close().catch(() => undefined);
      throw error;
    }
  };
}

const publish = createTelemetryPublisher();

export async function publishTelemetry(message: TelemetryMessage): Promise<void> {
  try {
    await publish(message);
  } catch (error) {
    // Do not log broker URLs, credentials, API keys, or telemetry payloads.
    console.error("RabbitMQ telemetry publish failed", {
      projectId: message.projectId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}
