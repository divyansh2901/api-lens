import type { RequestHandler } from "express";
import { AppError } from "../utils/errors.js";

interface WindowEntry { count: number; resetAt: number }

/** Per-user best-effort process-local cap protecting paid model calls. */
export function createAiRateLimit(options: { limit?: number; windowMs?: number; now?: () => number } = {}): RequestHandler {
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 10 * 60 * 1_000;
  const now = options.now ?? Date.now;
  const windows = new Map<string, WindowEntry>();

  return (req, res, next) => {
    const userId = (req as typeof req & { userId?: string }).userId;
    if (!userId) { next(new AppError(401, "UNAUTHORIZED", "Authentication required")); return; }
    const currentTime = now();
    for (const [key, entry] of windows) if (entry.resetAt <= currentTime) windows.delete(key);
    const entry = windows.get(userId);
    if (entry && entry.count >= limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000))));
      next(new AppError(429, "AI_RATE_LIMITED", "AI request limit reached. Try again after the current rate window"));
      return;
    }
    if (!entry || entry.resetAt <= currentTime) windows.set(userId, { count: 1, resetAt: currentTime + windowMs });
    else entry.count += 1;
    next();
  };
}

export const aiRateLimit = createAiRateLimit();
