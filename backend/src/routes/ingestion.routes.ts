import { Router } from "express";
import { randomUUID } from "node:crypto";
import { authenticateApiKey, type ApiKeyValidator } from "../middleware/api-key.middleware.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../utils/errors.js";
import { telemetrySchema, type TelemetryInput, type TelemetryMessage } from "../validators/telemetry.validators.js";
import { publishTelemetry } from "../services/rabbitmq.service.js";

export type TelemetryPublisher = (message: TelemetryMessage) => Promise<void>;

export interface IngestionDependencies {
  validateApiKey?: ApiKeyValidator;
  publishTelemetry?: TelemetryPublisher;
}

/** Create an ingestion router; injectable dependencies keep HTTP behavior testable. */
export function createIngestionRouter(dependencies: IngestionDependencies = {}) {
  const router = Router();
  const validateKey = dependencies.validateApiKey;
  const publish = dependencies.publishTelemetry ?? publishTelemetry;

  router.post(
    "/",
    authenticateApiKey(validateKey),
    validate(telemetrySchema),
    async (req, res) => {
      const projectId = req.projectId;
      if (!projectId) {
        throw new AppError(401, "INVALID_API_KEY", "A valid bearer API key is required");
      }

      const event = req.body as TelemetryInput;
      const message: TelemetryMessage = { ...event, eventId: randomUUID(), projectId };
      try {
        await publish(message);
      } catch {
        throw new AppError(503, "INGESTION_UNAVAILABLE", "Telemetry could not be queued; retry later");
      }

      console.info("Telemetry event queued", {
        projectId,
        method: event.method,
        statusCode: event.statusCode,
      });
      res.status(202).json({ success: true });
    },
  );

  return router;
}

export default createIngestionRouter();
