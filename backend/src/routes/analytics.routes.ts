import { Router, type RequestHandler } from "express";
import { analyticsController, createAnalyticsController } from "../controllers/analytics.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateQuery } from "../middleware/validate.js";
import type { AnalyticsService } from "../services/analytics.service.js";
import {
  analyticsTimeRangeSchema,
  recentRequestsQuerySchema,
} from "../validators/analytics.validators.js";

export function createAnalyticsRouter(
  service?: AnalyticsService,
  authenticateMiddleware: RequestHandler = authenticate,
) {
  const router = Router();
  const controller = service ? createAnalyticsController(service) : analyticsController;
  router.use(authenticateMiddleware);

  router.get("/:projectId/overview", validateQuery(analyticsTimeRangeSchema), controller.overview);
  router.get("/:projectId/traffic", validateQuery(analyticsTimeRangeSchema), controller.traffic);
  router.get("/:projectId/status-codes", validateQuery(analyticsTimeRangeSchema), controller.statusCodes);
  router.get("/:projectId/top-endpoints", validateQuery(analyticsTimeRangeSchema), controller.topEndpoints);
  router.get("/:projectId/slowest-endpoints", validateQuery(analyticsTimeRangeSchema), controller.slowestEndpoints);
  router.get("/:projectId/endpoint-errors", validateQuery(analyticsTimeRangeSchema), controller.endpointErrors);
  router.get("/:projectId/recent-requests", validateQuery(recentRequestsQuerySchema), controller.recentRequests);

  return router;
}

export default createAnalyticsRouter();
