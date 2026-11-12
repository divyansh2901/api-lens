import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface ObservatoryOptions {
  /** API key created for the monitored project. */
  apiKey: string;
  /** Receiver URL. Defaults to http://localhost:5000/ingest. */
  ingestionUrl?: string;
  /** Maximum time allowed for a telemetry request, in milliseconds. Defaults to 1000. */
  timeoutMs?: number;
  /** Called when delivery fails. Exceptions thrown by this callback are ignored. */
  onDeliveryError?: (error: Error) => void;
}

export interface TelemetryEvent {
  method: string;
  route: string;
  statusCode: number;
  latency: number;
  timestamp: string;
}

const DEFAULT_INGESTION_URL = "http://localhost:5000/ingest";
const DEFAULT_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

function validateOptions(options: ObservatoryOptions): Required<Pick<ObservatoryOptions, "apiKey" | "ingestionUrl" | "timeoutMs">> {
  if (!options || typeof options !== "object") {
    throw new TypeError("observatory options must be an object");
  }
  if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
    throw new TypeError("apiKey must be a non-empty string");
  }

  const ingestionUrl = options.ingestionUrl ?? DEFAULT_INGESTION_URL;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(ingestionUrl);
  } catch {
    throw new TypeError("ingestionUrl must be a valid absolute HTTP(S) URL");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new TypeError("ingestionUrl must use HTTP or HTTPS");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
  }

  return { apiKey: options.apiKey.trim(), ingestionUrl: parsedUrl.toString(), timeoutMs };
}

/**
 * Return a stable route template such as `/users/:userId`. For unmatched
 * requests, use a fixed label instead of a raw URL that could contain secrets.
 */
function normalizedRoute(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath !== "string" || !routePath.startsWith("/")) {
    return "/unmatched";
  }

  const fullPath = `${req.baseUrl || ""}/${routePath}`.replace(/\/{2,}/g, "/");
  if (fullPath === "/") return "/";
  return fullPath.replace(/\/+$/, "") || "/";
}

function reportDeliveryError(callback: ObservatoryOptions["onDeliveryError"], error: Error): void {
  if (!callback) return;
  try {
    callback(error);
  } catch {
    // An application callback must not affect the host server.
  }
}

async function deliver(event: TelemetryEvent, apiKey: string, url: string, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Telemetry receiver returned HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Capture safe request metrics and submit them asynchronously after the
 * response finishes. Telemetry delivery is best-effort and never enters the
 * Express error pipeline.
 */
export function observatory(options: ObservatoryOptions): RequestHandler {
  const validated = validateOptions(options);

  return (req: Request, res: Response, next: NextFunction): void => {
    let startedAt: bigint;
    try {
      startedAt = process.hrtime.bigint();
      res.once("finish", () => {
        try {
          const elapsedNs = process.hrtime.bigint() - startedAt;
          const event: TelemetryEvent = {
            method: req.method.toUpperCase(),
            route: normalizedRoute(req),
            statusCode: res.statusCode,
            latency: Math.max(0, Math.round(Number(elapsedNs) / 1_000_000)),
            timestamp: new Date().toISOString(),
          };

          // Detach delivery from the response lifecycle; swallow all failures.
          void deliver(event, validated.apiKey, validated.ingestionUrl, validated.timeoutMs)
            .catch((error: unknown) => {
              reportDeliveryError(
                options.onDeliveryError,
                error instanceof Error ? error : new Error("Telemetry delivery failed"),
              );
            });
        } catch (error) {
          reportDeliveryError(
            options.onDeliveryError,
            error instanceof Error ? error : new Error("Telemetry event creation failed"),
          );
        }
      });
    } catch (error) {
      reportDeliveryError(
        options.onDeliveryError,
        error instanceof Error ? error : new Error("Observatory middleware failed"),
      );
    }

    next();
  };
}
