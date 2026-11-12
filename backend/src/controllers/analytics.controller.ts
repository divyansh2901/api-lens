import type { Request, Response } from "express";
import {
  type AnalyticsService,
  analyticsService,
} from "../services/analytics.service.js";
import type {
  AnalyticsTimeRangeQuery,
  RecentRequestsQuery,
} from "../validators/analytics.validators.js";

function respond(res: Response, data: Record<string, unknown>): void {
  res.status(200).json({ success: true, data });
}

export function createAnalyticsController(service: AnalyticsService = analyticsService) {
  return {
    async overview(req: Request, res: Response): Promise<void> {
      respond(res, await service.overview(
        req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery,
      ));
    },
    async traffic(req: Request, res: Response): Promise<void> {
      respond(res, await service.traffic(
        req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery,
      ));
    },
    async statusCodes(req: Request, res: Response): Promise<void> {
      respond(res, await service.statusCodes(
        req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery,
      ));
    },
    async topEndpoints(req: Request, res: Response): Promise<void> {
      respond(res, await service.topEndpoints(
        req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery,
      ));
    },
    async slowestEndpoints(req: Request, res: Response): Promise<void> {
      respond(res, await service.slowestEndpoints(
        req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery,
      ));
    },
    async endpointErrors(req: Request, res: Response): Promise<void> {
      respond(res, await service.endpointErrors(
        req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery,
      ));
    },
    async recentRequests(req: Request, res: Response): Promise<void> {
      respond(res, await service.recentRequests(
        req.userId!, req.params.projectId as string, res.locals.validatedQuery as RecentRequestsQuery,
      ));
    },
  };
}

export const analyticsController = createAnalyticsController();
