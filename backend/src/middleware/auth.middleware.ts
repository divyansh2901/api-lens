import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/errors.js";
import { env } from "../config/env.js";

/**
 * JWT Authentication Middleware — protects routes that require login.
 *
 * WHY:
 * After login, the client receives a JWT. For protected routes (like
 * creating projects, viewing analytics), the client sends this JWT
 * in the Authorization header:
 *
 *   Authorization: Bearer eyJhbGciOiJI...
 *
 * This middleware:
 * 1. Extracts the token from the header
 * 2. Verifies it's a valid, non-expired JWT signed by our server
 * 3. Attaches the userId to the request so controllers know WHO is calling
 *
 * HOW TO USE:
 *   router.get("/projects", authenticate, projectController.list);
 *
 * After this middleware runs, the controller can access:
 *   req.userId  // the authenticated user's ID
 */

// Extend Express Request type to include our custom userId property
// This tells TypeScript that req.userId exists on authenticated routes
declare module "express" {
  interface Request {
    userId?: string;
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // 1. Get the Authorization header
  const authHeader = req.headers.authorization;

  // 2. Check format: "Bearer <token>"
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  // 3. Extract the token (everything after "Bearer ")
  const token = authHeader.split(" ")[1];

  try {
    // 4. Verify the token — this checks:
    //    - Is the signature valid? (was it signed by our JWT_SECRET?)
    //    - Has it expired? (we set 7d in auth.service.ts)
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };

    // 5. Attach userId to the request for downstream controllers
    req.userId = decoded.userId;

    next();
  } catch {
    // Token is invalid or expired
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
}
