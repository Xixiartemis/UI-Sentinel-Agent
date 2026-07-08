import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const controlPort = process.env.VALIDATE_TASK4_CONTROL_PORT ?? "3101";
const workerPort = process.env.VALIDATE_TASK4_WORKER_PORT ?? "8100";
const controlUrl = `http://127.0.0.1:${controlPort}`;
const workerUrl = `http://127.0.0.1:${workerPort}`;
const unique = Date.now();
const pythonExe = path.join(root, "apps", "python-worker", ".venv", "Scripts", "python.exe");
const processes = [];

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

function spawnProcess(command, args, options) {
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
          child.once("exit", resolve);
          child.kill();
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

async function waitForHealth(baseUrl, label, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited early:\n${child.output}`);
    }

    try {
      await request(baseUrl, label === "control-plane" ? "/api/projects" : "/health");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timed out waiting for ${label}:\n${child.output}`);
}

async function waitForBrowserSse(runId) {
  const response = await fetch(`${controlUrl}/api/runs/${runId}/stream`, {
    headers: { accept: "text/event-stream" },
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE connection failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error("SSE stream ended before browser.completed.");
      }
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("browser.completed")) {
        return buffer;
      }
    }
    throw new Error("Timed out waiting for browser.completed SSE event.");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

try {
  if (!existsSync(pythonExe)) {
    throw new Error(`Python worker virtualenv not found: ${pythonExe}`);
  }

  const control = spawnProcess("node", ["apps/control-plane/dist/main.js"], {
    env: {
      ...process.env,
      CONTROL_PLANE_PORT: controlPort,
    },
  });
  await waitForHealth(controlUrl, "control-plane", control);

  const worker = spawnProcess(pythonExe, ["-m", "uvicorn", "app.main:app", "--port", workerPort], {
    env: {
      ...process.env,
      PYTHONPATH: path.join(root, "apps", "python-worker"),
      ARTIFACT_ROOT: "data/artifacts",
    },
  });
  await waitForHealth(workerUrl, "worker", worker);

  const project = await request(controlUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: `Task 4 validation ${unique}`,
      local_path: "apps/demo-react-app",
    }),
  });

  const run = await request(controlUrl, "/api/runs", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      target_url: "https://example.com",
      task_goal: "Open the page and collect browser evidence.",
    }),
  });

  const ssePromise = waitForBrowserSse(run.id).catch((error) => {
    throw new Error(`SSE validation failed: ${error.message}`);
  });

  const workerResponse = await request(workerUrl, "/internal/browser/run", {
    method: "POST",
    body: JSON.stringify({
      run_id: run.id,
      target_url: "https://example.com",
      task_goal: "Open the page and collect browser evidence.",
      event_callback_url: `${controlUrl}/internal/runs/${run.id}/events`,
    }),
  });

  const sseChunk = await ssePromise;
  const events = await request(controlUrl, `/api/runs/${run.id}/events`);
  const eventTypes = new Set(events.map((event) => event.type));
  const requiredTypes = [
    "browser.started",
    "browser.step",
    "browser.screenshot",
    "browser.dom_snapshot",
    "browser.console",
    "browser.network",
    "browser.completed",
  ];
  const missingTypes = requiredTypes.filter((type) => !eventTypes.has(type));

  if (missingTypes.length > 0) {
    throw new Error(`Missing browser event types: ${missingTypes.join(", ")}`);
  }

  const screenshotPath = path.join(root, "data", "artifacts", run.id, "screenshot_001.png");
  const domPath = path.join(root, "data", "artifacts", run.id, "dom_snapshot_001.html");
  const consolePath = path.join(root, "data", "artifacts", run.id, "console_logs.json");
  const networkPath = path.join(root, "data", "artifacts", run.id, "network_events.json");

  for (const artifactPath of [screenshotPath, domPath, consolePath, networkPath]) {
    if (!existsSync(artifactPath)) {
      throw new Error(`Missing artifact: ${artifactPath}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        project_id: project.id,
        run_id: run.id,
        worker_status: workerResponse.status,
        event_count: events.length,
        required_events_present: missingTypes.length === 0,
        sse_received_browser_completed: sseChunk.includes("browser.completed"),
        artifacts: {
          screenshot: screenshotPath,
          dom_snapshot: domPath,
          console_logs: consolePath,
          network_events: networkPath,
        },
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
