import type { Request, Response } from "express";
import { aiService, type AiService } from "../services/ai.service.js";
import type { AnalyticsTimeRangeQuery } from "../validators/analytics.validators.js";
import type { AskAnalyticsInput } from "../validators/ai.validators.js";

function respond(res: Response, data: Record<string, unknown>): void {
  res.status(200).json({ success: true, data });
}

export function createAiController(service: AiService = aiService) {
  return {
    async insights(req: Request, res: Response): Promise<void> {
      respond(res, await service.insights(req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery));
    },
    async ask(req: Request, res: Response): Promise<void> {
      respond(res, await service.ask(req.userId!, req.params.projectId as string, res.locals.validatedQuery as AnalyticsTimeRangeQuery, req.body as AskAnalyticsInput));
    },
  };
}

export const aiController = createAiController();
