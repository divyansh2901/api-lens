import prisma from "./config/prisma.js";
import { startTelemetryWorker } from "./services/telemetry-worker.service.js";

const worker = startTelemetryWorker();
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("Stopping API Lens telemetry worker", { signal });

  try {
    await worker.close();
    await prisma.$disconnect();
    console.info("API Lens telemetry worker stopped");
  } catch (error) {
    console.error("API Lens telemetry worker shutdown failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
