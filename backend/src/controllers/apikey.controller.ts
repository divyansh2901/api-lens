import { Request, Response } from "express";
import * as apikeyService from "../services/apikey.service.js";

/**
 * API Key Controller — HTTP layer for API key management.
 *
 * All these endpoints are scoped under /api/projects/:projectId/keys
 * This is a RESTful pattern called "nested resources":
 *
 *   /api/projects/:projectId/keys         → keys BELONG TO a project
 *   /api/projects/:projectId/keys/:keyId  → a specific key in that project
 *
 * The projectId comes from req.params.projectId (set by the route).
 */

export async function generate(req: Request, res: Response): Promise<void> {
  const result = await apikeyService.generateKey(
    req.userId!,
    req.params.projectId as string
  );

  // 201 Created + the raw key (shown only once!)
  res.status(201).json({
    success: true,
    data: result,
  });
}

export async function list(req: Request, res: Response): Promise<void> {
  const keys = await apikeyService.listKeys(
    req.userId!,
    req.params.projectId as string
  );

  res.status(200).json({
    success: true,
    data: keys,
  });
}

export async function revoke(req: Request, res: Response): Promise<void> {
  await apikeyService.revokeKey(
    req.userId!,
    req.params.projectId as string,
    req.params.keyId as string
  );

  res.status(204).send();
}
