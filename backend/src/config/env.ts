function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and configure it.`);
  }
  return value;
}

const databaseUrl = required("DATABASE_URL");
try {
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error();
  }
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long.");
}

const port = Number(process.env.PORT?.trim() || "5000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const rabbitMqUrl = process.env.RABBITMQ_URL?.trim() || "amqp://localhost:5672";
try {
  const parsed = new URL(rabbitMqUrl);
  if (parsed.protocol !== "amqp:" && parsed.protocol !== "amqps:") {
    throw new Error();
  }
} catch {
  throw new Error("RABBITMQ_URL must be a valid AMQP or AMQPS connection URL.");
}

export const env = {
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret,
  PORT: port,
  RABBITMQ_URL: rabbitMqUrl,
  // AI is optional so existing API features continue working without Gemini configured.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() || undefined,
  GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
  GEMINI_TIMEOUT_MS: Number(process.env.GEMINI_TIMEOUT_MS?.trim() || "20000"),
};

if (!Number.isInteger(env.GEMINI_TIMEOUT_MS) || env.GEMINI_TIMEOUT_MS < 1_000 || env.GEMINI_TIMEOUT_MS > 120_000) {
  throw new Error("GEMINI_TIMEOUT_MS must be an integer between 1000 and 120000.");
}
