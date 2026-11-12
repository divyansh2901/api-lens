import crypto from "node:crypto";
import prisma from "../config/prisma.js";
import { AppError } from "../utils/errors.js";
import * as projectService from "./project.service.js";

/**
 * API Key Service — generates, lists, and revokes API keys.
 *
 * ═══════════════════════════════════════════════════════════════
 * KEY CONCEPT: WHY HASH API KEYS?
 * ═══════════════════════════════════════════════════════════════
 *
 * If we stored raw API keys in the database and someone got access
 * to our database (SQL injection, backup leak, insider threat),
 * they would have ALL the API keys and could impersonate any user's SDK.
 *
 * Instead, we store a HASH of the key. Even if the database leaks,
 * the attacker can't reverse the hash to get the original key.
 *
 * ═══════════════════════════════════════════════════════════════
 * KEY CONCEPT: SHA-256 vs BCRYPT — WHY USE SHA-256 HERE?
 * ═══════════════════════════════════════════════════════════════
 *
 * For PASSWORDS, we use bcrypt because:
 *   - Passwords are short, low-entropy, human-chosen ("password123")
 *   - Attackers can try billions of common passwords
 *   - bcrypt is intentionally SLOW to resist brute force
 *   - bcrypt adds a random salt, so same password → different hash
 *
 * For API KEYS, we use SHA-256 because:
 *   - API keys are LONG (32 random bytes = 256 bits of entropy)
 *   - They're cryptographically random (not human-chosen)
 *   - Even with the fastest computers, brute-forcing 256 bits is impossible
 *   - SHA-256 is FAST, which matters because we hash the key on EVERY
 *     incoming telemetry request to look it up in the database
 *   - SHA-256 is deterministic: same input → same hash, so we can
 *     do a direct database lookup: WHERE keyHash = sha256(incomingKey)
 *
 * With bcrypt, we'd need to load ALL keys and compare one by one
 * (bcrypt adds random salt, so we can't search by hash directly).
 * That's O(n) instead of O(1) — terrible for performance.
 *
 * ═══════════════════════════════════════════════════════════════
 * KEY FORMAT: lens_<64 hex chars>
 * ═══════════════════════════════════════════════════════════════
 *
 * The "lens_" prefix makes the key easily identifiable:
 *   - Developers know it's an API Lens key at a glance
 *   - Secret scanning tools (GitHub, GitGuardian) can detect leaked keys
 *   - Similar to how Stripe uses "sk_live_" and GitHub uses "ghp_"
 */

/**
 * Generates a cryptographically secure random API key.
 *
 * crypto.randomBytes(32) produces 32 random bytes from the OS's
 * cryptographically secure random number generator (CSPRNG).
 * Converting to hex gives us 64 characters (2 hex chars per byte).
 *
 * Total key: "lens_" + 64 hex chars = 68 characters
 * Entropy: 256 bits (practically impossible to guess)
 */
function generateRawKey(): string {
  const randomPart = crypto.randomBytes(32).toString("hex");
  return `lens_${randomPart}`;
}

/**
 * Hashes an API key using SHA-256.
 *
 * This is a one-way function: you can go from key → hash,
 * but you can NEVER go from hash → key.
 */
function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Generate a new API key for a project.
 *
 * FLOW:
 * 1. Verify the project exists and belongs to this user (ownership check)
 * 2. Generate a cryptographically random key
 * 3. Hash the key
 * 4. Store ONLY the hash in the database
 * 5. Return the raw key to the user ONCE — it can never be retrieved again
 *
 * WHY RETURN THE KEY ONLY ONCE?
 * We don't store the raw key anywhere. After this response, neither
 * we nor the user can see it again. The user must copy and save it
 * immediately (like GitHub personal access tokens).
 */
export async function generateKey(userId: string, projectId: string) {
  // 1. Verify ownership — throws 404 if not found/not owned
  await projectService.getProject(userId, projectId);

  // 2. Generate the raw key
  const rawKey = generateRawKey();

  // 3. Hash it
  const keyHash = hashKey(rawKey);

  // 4. Store only the hash
  const apiKey = await prisma.apiKey.create({
    data: {
      keyHash,
      projectId,
    },
  });

  // 5. Return raw key (shown ONCE) + metadata
  return {
    id: apiKey.id,
    rawKey,  // ← This is the ONLY time the raw key is exposed
    createdAt: apiKey.createdAt,
  };
}

/**
 * List all API keys for a project.
 *
 * IMPORTANT: We return metadata only (id, createdAt, revokedAt).
 * We NEVER return the keyHash — even the hash shouldn't be exposed
 * to the frontend unnecessarily.
 *
 * WHY INCLUDE REVOKED KEYS?
 * So the user can see a history of their keys and know which ones
 * were revoked. We use `revokedAt: null` checks elsewhere to filter
 * out revoked keys during authentication.
 */
export async function listKeys(userId: string, projectId: string) {
  // Verify ownership first
  await projectService.getProject(userId, projectId);

  const keys = await prisma.apiKey.findMany({
    where: { projectId },
    select: {
      id: true,
      createdAt: true,
      revokedAt: true,
      // keyHash is intentionally excluded — never expose to the client
    },
    orderBy: { createdAt: "desc" },
  });

  return keys;
}

/**
 * Revoke an API key (soft delete).
 *
 * WHY SOFT DELETE (revokedAt) INSTEAD OF HARD DELETE?
 * - Audit trail: we can see when a key was revoked
 * - No cascading issues: nothing else references ApiKey
 * - The user can see their key history
 * - We can distinguish "this key was revoked" from "this key never existed"
 *
 * After revocation, any SDK using this key will get 401 Unauthorized
 * on the next telemetry request.
 */
export async function revokeKey(userId: string, projectId: string, keyId: string) {
  // Verify project ownership
  await projectService.getProject(userId, projectId);

  // Find the key and verify it belongs to this project
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, projectId },
  });

  if (!apiKey) {
    throw new AppError(404, "KEY_NOT_FOUND", "API key not found");
  }

  if (apiKey.revokedAt) {
    throw new AppError(400, "KEY_ALREADY_REVOKED", "API key is already revoked");
  }

  // Soft delete — set revokedAt timestamp
  await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });
}

/**
 * EXPORTED FOR USE BY INGESTION API (Phase 5)
 *
 * Validates an incoming API key from the SDK.
 * This will be called on every single telemetry request.
 *
 * FLOW:
 * 1. Hash the incoming key with SHA-256
 * 2. Look up the hash in the database (O(1) lookup thanks to unique index)
 * 3. Check if the key exists and hasn't been revoked
 * 4. Return the associated projectId
 *
 * WHY IS THIS HERE AND NOT IN AUTH MIDDLEWARE?
 * SDK authentication (API keys) is fundamentally different from
 * dashboard authentication (JWT). They serve different purposes:
 *   - JWT: "which human user is logged into the dashboard?"
 *   - API Key: "which project is this SDK sending telemetry for?"
 */
export interface ApiKeyRecord {
  projectId: string;
  revokedAt: Date | null;
}

export type ApiKeyHashLookup = (keyHash: string) => Promise<ApiKeyRecord | null>;

/** Build the hash lookup used for API key validation and exercised in tests. */
export function createApiKeyValidator(lookup: ApiKeyHashLookup) {
  return async function validateApiKey(rawKey: string): Promise<string> {
    if (typeof rawKey !== "string" || rawKey.length === 0 || rawKey.length > 256) {
      throw new AppError(401, "INVALID_API_KEY", "Invalid API key");
    }

    const apiKey = await lookup(hashKey(rawKey));
    if (!apiKey) {
      throw new AppError(401, "INVALID_API_KEY", "Invalid API key");
    }
    if (apiKey.revokedAt) {
      throw new AppError(401, "REVOKED_API_KEY", "API key has been revoked");
    }

    return apiKey.projectId;
  };
}

export const validateApiKey = createApiKeyValidator(async (keyHash) =>
  prisma.apiKey.findUnique({
    where: { keyHash },
    select: { projectId: true, revokedAt: true },
  }),
);
