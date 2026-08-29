import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { AppError } from "../utils/errors.js";
import type { SignupInput, LoginInput } from "../validators/auth.validators.js";

/**
 * Auth Service — contains ALL the business logic for authentication.
 *
 * WHY A SERVICE?
 * The layered architecture pattern separates concerns:
 *   Route → Controller → Service → Database
 *
 * - Routes: define URL paths
 * - Controllers: handle HTTP concerns (req, res, status codes)
 * - Services: contain the actual business logic
 * - Database: Prisma handles data access
 *
 * The controller should NEVER contain password hashing, JWT signing,
 * or database queries. It just calls the service and sends the response.
 */

// JWT secret from environment — never hardcode this
const JWT_SECRET = process.env.JWT_SECRET!;

/**
 * Generates a JWT token for a given user ID.
 *
 * WHAT IS JWT?
 * JSON Web Token — a signed string that encodes a payload.
 * After login, we send this token to the client. The client includes
 * it in the Authorization header of subsequent requests. Our auth
 * middleware verifies the signature to identify the user.
 *
 * WHY userId ONLY?
 * The JWT should contain the minimum required claims. We only need
 * to identify WHO is making the request. Don't put email, name,
 * roles, etc. in the JWT unless absolutely necessary — the token
 * travels with every request and can be decoded by anyone (it's
 * signed, not encrypted).
 */
function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Signup — create a new user account.
 *
 * FLOW:
 * 1. Check if email already exists (prevent duplicate accounts)
 * 2. Hash the password with bcrypt (NEVER store plaintext passwords)
 * 3. Create the user in the database
 * 4. Generate a JWT so the user is logged in immediately after signup
 * 5. Return token + user info (without the password hash!)
 *
 * WHY BCRYPT?
 * bcrypt is a one-way hash specifically designed for passwords.
 * It's intentionally slow (configurable via salt rounds) to make
 * brute-force attacks expensive. The salt is built into the hash,
 * so even identical passwords produce different hashes.
 *
 * SALT ROUNDS (10):
 * Each increment doubles the computation time.
 * 10 rounds ≈ ~100ms per hash — fast enough for login,
 * slow enough to resist brute force.
 */
export async function signup(data: SignupInput) {
  // 1. Check for existing user
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new AppError(409, "EMAIL_EXISTS", "Email is already registered");
  }

  // 2. Hash the password (10 salt rounds)
  const passwordHash = await bcrypt.hash(data.password, 10);

  // 3. Create the user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
    },
  });

  // 4. Generate JWT
  const token = generateToken(user.id);

  // 5. Return — NEVER include passwordHash in the response
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  };
}

/**
 * Login — authenticate an existing user.
 *
 * FLOW:
 * 1. Find user by email
 * 2. Compare the provided password against the stored hash
 * 3. If valid, generate a JWT
 * 4. Return token + user info
 *
 * SECURITY NOTE — GENERIC ERROR MESSAGES:
 * We use "Invalid email or password" for BOTH cases (user not found
 * AND wrong password). This prevents attackers from discovering which
 * emails are registered in the system (enumeration attack).
 */
export async function login(data: LoginInput) {
  // 1. Find user by email
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  // 2. User not found — use generic error message
  if (!user) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  // 3. Compare password with stored hash
  const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  // 4. Generate JWT
  const token = generateToken(user.id);

  // 5. Return — NEVER include passwordHash
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  };
}
