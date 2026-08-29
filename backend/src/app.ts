import express from "express";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

// Parse JSON request bodies — without this, req.body would be undefined
app.use(express.json());

// ── Health Check ─────────────────────────────────────────────────
// Simple endpoint to verify the server is running.
// Used by Docker, load balancers, and monitoring tools.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── API Routes ───────────────────────────────────────────────────
// Mount auth routes under /api/auth prefix
// So routes become: POST /api/auth/signup, POST /api/auth/login
app.use("/api/auth", authRoutes);

// Mount project routes under /api/projects prefix
// All project routes require JWT authentication (handled inside the router)
app.use("/api/projects", projectRoutes);

// ── Error Handler ────────────────────────────────────────────────
// MUST be registered AFTER all routes.
// Express identifies error handlers by the 4-parameter signature
// (err, req, res, next). Any error thrown or passed via next(err)
// in the routes above will be caught here.
app.use(errorHandler);

export default app;