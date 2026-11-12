import express from "express";
import { apiLens } from "../dist/index.js";

export function createSampleApp({ apiKey = "lens_example_key", ingestionUrl, onDeliveryError } = {}) {
  const app = express();
  app.use(apiLens({ apiKey, ingestionUrl, onDeliveryError }));

  app.get("/users/:userId", (req, res) => {
    // The user ID is intentionally not included in telemetry; the SDK records
    // the Express route template `/users/:userId` instead.
    res.json({ userId: req.params.userId });
  });

  const versionedRoutes = express.Router();
  versionedRoutes.get("/orders/:orderId", (_req, res) => res.json({ ok: true }));
  app.use("/v1", versionedRoutes);

  app.get("/fail", (_req, res) => res.status(503).json({ error: "sample failure" }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createSampleApp({
    apiKey: process.env.API_LENS_API_KEY ?? "lens_example_key",
    ingestionUrl: process.env.API_LENS_INGESTION_URL,
    onDeliveryError: (error) => console.error("Telemetry delivery failed:", error.message),
  });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`Sample API listening at http://localhost:${port}`));
}
