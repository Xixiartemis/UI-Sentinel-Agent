import "dotenv/config";
import pg from "pg";
import { createClient } from "redis";

const { Client } = pg;
const connectionTimeoutMs = 10_000;

async function checkPostgres(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: connectionTimeoutMs,
  });

  try {
    await client.connect();
    const result = await client.query(
      "SELECT current_database() AS database, extversion FROM pg_extension WHERE extname = 'vector'",
    );

    if (result.rowCount !== 1) {
      throw new Error(
        "PostgreSQL is reachable, but the pgvector extension is not enabled. Run: CREATE EXTENSION IF NOT EXISTS vector;",
      );
    }

    console.log(
      `[ok] PostgreSQL connected; pgvector ${result.rows[0].extversion} is enabled.`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkRedis(redisUrl) {
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: connectionTimeoutMs,
    },
  });

  client.on("error", () => {
    // Connection errors are reported once by the outer check.
  });

  try {
    await client.connect();
    const response = await client.ping();

    if (response !== "PONG") {
      throw new Error(`Unexpected Redis PING response: ${response}`);
    }

    console.log("[ok] Redis connected; PING returned PONG.");
  } finally {
    if (client.isOpen) {
      await client.close().catch(() => undefined);
    }
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const checks = [];

console.log(`Infrastructure mode: ${process.env.INFRA_MODE || "external"}`);

if (databaseUrl) {
  checks.push(["PostgreSQL", () => checkPostgres(databaseUrl)]);
} else {
  console.log("[skip] DATABASE_URL is not configured; PostgreSQL check skipped.");
}

if (redisUrl) {
  checks.push(["Redis", () => checkRedis(redisUrl)]);
} else {
  console.log("[skip] REDIS_URL is not configured; Redis check skipped.");
}

if (checks.length === 0) {
  console.log(
    "No external services are configured. Set DATABASE_URL and REDIS_URL in .env to run connectivity checks.",
  );
  process.exit(0);
}

let failed = false;

for (const [name, check] of checks) {
  try {
    await check();
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[fail] ${name}: ${message}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
