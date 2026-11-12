import type { Request, RequestHandler } from "express";
import { AppError } from "../utils/errors.js";
import { validateApiKey } from "../services/apikey.service.js";

declare module "express-serve-static-core" {
  interface Request {
    projectId?: string;
  }
}

export type ApiKeyValidator = (rawKey: string) => Promise<string>;

function readBearerKey(req: Request): string {
  const header = req.headers.authorization;
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || match[1].length > 256) {
    throw new AppError(401, "INVALID_API_KEY", "A valid bearer API key is required");
  }
  return match[1];
}

/** Authenticate SDK telemetry and attach the key's project ID to the request. */
export function authenticateApiKey(
  validateKey: ApiKeyValidator = validateApiKey,
): RequestHandler {
  return async (req, _res, next) => {
    const rawKey = readBearerKey(req);
    req.projectId = await validateKey(rawKey);
    next();
  };
}
