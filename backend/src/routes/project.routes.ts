import { Router } from "express";
import * as projectController from "../controllers/project.controller.js";
import * as apikeyController from "../controllers/apikey.controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { createProjectSchema } from "../validators/project.validators.js";

/**
 * Project Routes — all routes here require authentication.
 *
 * ═══════════════════════════════════════════════════════════════
 * ROUTE DESIGN: RESTful CONVENTIONS
 * ═══════════════════════════════════════════════════════════════
 *
 * REST (Representational State Transfer) uses HTTP methods meaningfully:
 *
 *   GET    → Read (no side effects, safe to repeat)
 *   POST   → Create (creates a new resource)
 *   PUT    → Full update (replace the entire resource)
 *   PATCH  → Partial update (modify some fields)
 *   DELETE → Remove
 *
 * Resource naming is always plural nouns (projects, not project):
 *   /api/projects           → the collection of projects
 *   /api/projects/:id       → a specific project
 *   /api/projects/:id/keys  → keys belonging to that project (nested resource)
 *
 * ═══════════════════════════════════════════════════════════════
 * MIDDLEWARE CHAIN: authenticate runs on EVERY route in this file
 * ═══════════════════════════════════════════════════════════════
 *
 * router.use(authenticate) applies the JWT check to ALL routes below it.
 * This means every project/key operation requires a valid JWT token.
 * If the token is missing/invalid/expired, the request is rejected
 * before it ever reaches our controllers.
 */
const router = Router();

// Apply JWT authentication to ALL routes in this router
router.use(authenticate);

// ── Project CRUD ─────────────────────────────────────────────

router.post("/", validate(createProjectSchema), projectController.create);
router.get("/", projectController.list);
router.get("/:id", projectController.getById);
router.delete("/:id", projectController.remove);

// ── API Key Management (nested under projects) ──────────────
// These use :projectId instead of :id because Express needs
// unique param names when routes are nested

router.post("/:projectId/keys", apikeyController.generate);
router.get("/:projectId/keys", apikeyController.list);
router.delete("/:projectId/keys/:keyId", apikeyController.revoke);

export default router;
