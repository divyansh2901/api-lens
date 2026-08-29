import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { signupSchema, loginSchema } from "../validators/auth.validators.js";

/**
 * Auth Routes — defines URL paths for authentication.
 *
 * THE REQUEST PIPELINE:
 *
 *   POST /api/auth/signup
 *     → validate(signupSchema)     ← Zod checks the body
 *     → authController.signup      ← Controller calls service, sends response
 *
 *   POST /api/auth/login
 *     → validate(loginSchema)      ← Zod checks the body
 *     → authController.login       ← Controller calls service, sends response
 *
 * WHY VALIDATION BEFORE CONTROLLER?
 * By the time the controller runs, req.body is guaranteed to be valid.
 * The controller doesn't need to check "is email present?" or
 * "is password long enough?" — that's already handled.
 *
 * WHY Router()?
 * Express Router lets us define a group of routes that share a prefix.
 * In app.ts, we'll mount this as: app.use("/api/auth", authRoutes)
 * So these become: POST /api/auth/signup and POST /api/auth/login
 */
const router = Router();

router.post("/signup", validate(signupSchema), authController.signup);
router.post("/login", validate(loginSchema), authController.login);

export default router;
