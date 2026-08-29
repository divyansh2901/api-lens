import { Request, Response } from "express";
import * as projectService from "../services/project.service.js";

/**
 * Project Controller — HTTP layer for project management.
 *
 * PATTERN TO NOTICE:
 * Every handler accesses `req.userId!` — this is the userId that the
 * authenticate middleware attached to the request after verifying the JWT.
 *
 * The `!` (non-null assertion) is safe here because these routes are
 * always behind the authenticate middleware — if there's no valid JWT,
 * the request never reaches these controllers.
 */

export async function create(req: Request, res: Response): Promise<void> {
  const project = await projectService.createProject(req.userId!, req.body);

  res.status(201).json({
    success: true,
    data: project,
  });
}

export async function list(req: Request, res: Response): Promise<void> {
  const projects = await projectService.listProjects(req.userId!);

  res.status(200).json({
    success: true,
    data: projects,
  });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const project = await projectService.getProject(req.userId!, req.params.id as string);

  res.status(200).json({
    success: true,
    data: project,
  });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await projectService.deleteProject(req.userId!, req.params.id as string);

  // 204 No Content — standard response for successful deletions
  // No body is sent back (the resource no longer exists)
  res.status(204).send();
}
