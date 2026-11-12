import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import type { WorkerTelemetryMessage } from "../validators/telemetry.validators.js";

export type PersistResult = "stored" | "duplicate";
type RequestLogCreate = (args: Prisma.RequestLogCreateArgs) => Promise<unknown>;

/** Persist one queued event; a repeated event ID is considered successful. */
export function createRequestLogPersister(createRequestLog: RequestLogCreate) {
  return async function persistTelemetryEvent(message: WorkerTelemetryMessage): Promise<PersistResult> {
    try {
      await createRequestLog({
        data: {
          eventId: message.eventId,
          projectId: message.projectId,
          method: message.method,
          route: message.route,
          statusCode: message.statusCode,
          latency: message.latency,
          timestamp: new Date(message.timestamp),
        },
      });
      return "stored";
    } catch (error) {
      if (isEventIdConflict(error)) return "duplicate";
      throw error;
    }
  };
}

export const persistTelemetryEvent = createRequestLogPersister((args) => prisma.requestLog.create(args));

function isEventIdConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes("eventId")
    : typeof target === "string" && target.includes("eventId");
}
