import { spawn } from "node:child_process";

const port = process.env.VALIDATE_TASK3_PORT ?? "3100";
const baseUrl = process.env.CONTROL_PLANE_URL ?? `http://localhost:${port}`;
const unique = Date.now();
let server;

async function startServer() {
  server = spawn("node", ["apps/control-plane/dist/main.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTROL_PLANE_PORT: port,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Control plane exited early:\n${output}`);
    }

    try {
      await request("/api/projects");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timed out waiting for control plane startup:\n${output}`);
}

async function stopServer() {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return body;
}

async function waitForSseEvent(runId) {
  const response = await fetch(`${baseUrl}/api/runs/${runId}/stream`, {
    headers: {
      accept: "text/event-stream",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE connection failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        throw new Error("SSE stream ended before an event was received.");
      }

      buffer += decoder.decode(value, { stream: true });

      if (buffer.includes("\n\n")) {
        return buffer;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

try {
  await startServer();

  const project = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: `Task 3 validation ${unique}`,
      local_path: "apps/demo-react-app",
    }),
  });

  const run = await request("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      target_url: "http://localhost:5173/login",
      task_goal: "Validate empty login form.",
    }),
  });

  const event = {
    event_id: `evt_${unique}`,
    run_id: run.id,
    timestamp: new Date().toISOString(),
    agent: "control-plane",
    type: "run.started",
    status: "running",
    payload: {
      message: "Task 3 validation event",
    },
  };

  const ssePromise = waitForSseEvent(run.id);

  await new Promise((resolve) => setTimeout(resolve, 300));

  const persisted = await request(`/internal/runs/${run.id}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });

  const sseChunk = await Promise.race([
    ssePromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for SSE event.")), 10_000),
    ),
  ]);

  const historical = await request(`/api/runs/${run.id}/events`);

  const found = historical.some((item) => item.event_id === event.event_id);

  if (!found) {
    throw new Error("Persisted event was not returned by the historical events API.");
  }

  console.log(
    JSON.stringify(
      {
        project_id: project.id,
        run_id: run.id,
        persisted_event_id: persisted.event_id,
        historical_event_count: historical.length,
        sse_received: sseChunk.includes(event.event_id),
      },
      null,
      2,
    ),
  );
} finally {
  await stopServer();
}
