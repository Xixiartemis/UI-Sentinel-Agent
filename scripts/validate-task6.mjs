import "dotenv/config";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const root = process.cwd();
const controlPort = process.env.VALIDATE_TASK6_CONTROL_PORT ?? "3100";
const workerPort = process.env.VALIDATE_TASK6_WORKER_PORT ?? "8000";
const controlUrl = `http://127.0.0.1:${controlPort}`;
const workerUrl = `http://127.0.0.1:${workerPort}`;
const unique = Date.now();
const pythonExe = path.join(root, "apps", "python-worker", ".venv", "Scripts", "python.exe");
const processes = [];

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  child.output = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  processes.push(child);
  return child;
}

async function stopProcesses() {
  await Promise.all(
    processes.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }
          if (process.platform === "win32") {
            const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
              stdio: "ignore",
            });
            killer.once("exit", resolve);
            return;
          }
          child.once("exit", resolve);
          child.kill("SIGTERM");
        }),
    ),
  );
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${route} failed: ${response.status} ${text}`);
  }

  return body;
}

async function waitForHttp(url, label, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited early:\n${child.output}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timed out waiting for ${label}:\n${child.output}`);
}

async function isHttpAvailable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function queryChunkStats(projectId) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    const result = await client.query(
      `
      SELECT
        count(*)::int AS chunk_count,
        count(*) FILTER (
          WHERE file_path ILIKE '%LoginForm%' OR file_path ILIKE '%login%'
        )::int AS login_chunk_count,
        count(*) FILTER (
          WHERE chunk_type IN ('component', 'validation')
        )::int AS component_or_validation_count,
        min(vector_dims(embedding))::int AS min_embedding_dim,
        max(vector_dims(embedding))::int AS max_embedding_dim
      FROM code_chunks
      WHERE project_id = $1
      `,
      [projectId],
    );

    const samples = await client.query(
      `
      SELECT file_path, chunk_type, symbol_name, start_line, end_line
      FROM code_chunks
      WHERE project_id = $1
      ORDER BY file_path, start_line, chunk_type
      LIMIT 8
      `,
      [projectId],
    );

    return {
      ...result.rows[0],
      samples: samples.rows,
    };
  } finally {
    await client.end();
  }
}

try {
  if (!existsSync(pythonExe)) {
    throw new Error(`Python worker virtualenv not found: ${pythonExe}`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Task 6 validation.");
  }

  if (!(await isHttpAvailable(`${controlUrl}/api/projects`))) {
    const control = spawnProcess("node", ["apps/control-plane/dist/main.js"], {
      env: {
        ...process.env,
        CONTROL_PLANE_PORT: controlPort,
      },
    });
    await waitForHttp(`${controlUrl}/api/projects`, "control-plane", control);
  }

  if (!(await isHttpAvailable(`${workerUrl}/health`))) {
    const worker = spawnProcess(pythonExe, ["-m", "uvicorn", "app.main:app", "--port", workerPort], {
      env: {
        ...process.env,
        PYTHONPATH: path.join(root, "apps", "python-worker"),
      },
    });
    await waitForHttp(`${workerUrl}/health`, "worker", worker);
  }

  const project = await request(controlUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: `Task 6 validation ${unique}`,
      local_path: "apps/demo-react-app",
    }),
  });

  const run = await request(controlUrl, "/api/runs", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      target_url: "http://127.0.0.1:5273/",
      task_goal: "Index the demo React app source code.",
    }),
  });

  const indexerResponse = await request(workerUrl, "/internal/indexer/run", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      run_id: run.id,
      local_path: "apps/demo-react-app",
      event_callback_url: `${controlUrl}/internal/runs/${run.id}/events`,
    }),
  });

  const events = await request(controlUrl, `/api/runs/${run.id}/events`);
  const eventTypes = new Set(events.map((event) => event.type));
  const requiredEvents = [
    "indexer.started",
    "indexer.file_scanned",
    "indexer.chunk_created",
    "indexer.embedding_created",
    "indexer.completed",
  ];
  const missingEvents = requiredEvents.filter((type) => !eventTypes.has(type));

  if (missingEvents.length > 0) {
    throw new Error(`Missing indexer events: ${missingEvents.join(", ")}`);
  }

  const stats = await queryChunkStats(project.id);

  if (stats.chunk_count <= 10) {
    throw new Error(`Expected more than 10 chunks; got ${stats.chunk_count}.`);
  }
  if (stats.login_chunk_count < 1) {
    throw new Error("Expected LoginForm/login-related chunks.");
  }
  if (stats.component_or_validation_count < 1) {
    throw new Error("Expected component or validation chunks.");
  }
  if (stats.min_embedding_dim !== 1536 || stats.max_embedding_dim !== 1536) {
    throw new Error(
      `Expected 1536-dimensional embeddings; got ${stats.min_embedding_dim}-${stats.max_embedding_dim}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        project_id: project.id,
        run_id: run.id,
        response: indexerResponse,
        indexer_events_present: missingEvents.length === 0,
        chunk_count: stats.chunk_count,
        login_chunk_count: stats.login_chunk_count,
        component_or_validation_count: stats.component_or_validation_count,
        embedding_dimensions: [stats.min_embedding_dim, stats.max_embedding_dim],
        samples: stats.samples,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  for (const child of processes) {
    console.error(`\n--- process ${child.pid} output ---\n${child.output}`);
  }
  process.exitCode = 1;
} finally {
  await stopProcesses();
}
