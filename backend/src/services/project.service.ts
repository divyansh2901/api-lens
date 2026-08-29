import prisma from "../config/prisma.js";
import { AppError } from "../utils/errors.js";
import type { CreateProjectInput } from "../validators/project.validators.js";

/**
 * Project Service — business logic for managing projects.
 *
 * KEY CONCEPT: OWNERSHIP ENFORCEMENT
 * Every single query in this service includes `userId` in the WHERE clause.
 * This is the most important security pattern in a multi-user system.
 *
 * Without this, a malicious user could guess another user's project ID
 * and access their data. By always filtering by userId, we guarantee
 * that User A can NEVER see, modify, or delete User B's projects —
 * even if they somehow know the project's UUID.
 *
 * Example of what NOT to do:
 *   prisma.project.findUnique({ where: { id: projectId } })  // ❌ DANGEROUS
 *
 * What we always do instead:
 *   prisma.project.findFirst({ where: { id: projectId, userId } })  // ✅ SAFE
 */

/**
 * Create a new project for the authenticated user.
 */
export async function createProject(userId: string, data: CreateProjectInput) {
  const project = await prisma.project.create({
    data: {
      name: data.name,
      userId,
    },
  });

  return project;
}

/**
 * List all projects belonging to the authenticated user.
 *
 * WHY orderBy createdAt desc?
 * Newest projects appear first — most natural for a dashboard.
 */
export async function listProjects(userId: string) {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return projects;
}

/**
 * Get a single project by ID — but ONLY if it belongs to this user.
 *
 * WHY findFirst instead of findUnique?
 * findUnique only works with unique fields (like `id` alone).
 * We need to filter by BOTH `id` AND `userId` to enforce ownership.
 * findFirst lets us use any combination of fields in the where clause.
 *
 * If the project doesn't exist OR belongs to another user,
 * we return the same 404 error. We don't tell the attacker
 * "this project exists but isn't yours" — that leaks information.
 */
export async function getProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return project;
}

/**
 * Delete a project — only if it belongs to this user.
 *
 * WHY check first, then delete?
 * Prisma's delete() throws if the record doesn't exist. But we want
 * to also enforce ownership. So we first verify the project belongs
 * to this user, then delete it.
 *
 * CASCADING DELETES:
 * In our Prisma schema, ApiKey and RequestLog have `onDelete: Cascade`.
 * This means when we delete a project, Prisma/PostgreSQL automatically
 * deletes all associated API keys and request logs. No orphaned data.
 */
export async function deleteProject(userId: string, projectId: string) {
  // First verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  await prisma.project.delete({
    where: { id: projectId },
  });
}
