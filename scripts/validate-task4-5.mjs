import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const controlPort = process.env.VALIDATE_TASK45_CONTROL_PORT ?? "3100";
const workerPort = process.env.VALIDATE_TASK45_WORKER_PORT ?? "8101";
const demoPort = process.env.VALIDATE_TASK45_DEMO_PORT ?? "5273";
const controlUrl = `http://127.0.0.1:${controlPort}`;
const workerUrl = `http://127.0.0.1:${workerPort}`;
const demoUrl = `http://127.0.0.1:${demoPort}/`;
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
  await waitForHttp(`${controlUrl}/api/projects`, "control-plane", control);

  const worker = spawnProcess(pythonExe, ["-m", "uvicorn", "app.main:app", "--port", workerPort], {
    env: {
      ...process.env,
      PYTHONPATH: path.join(root, "apps", "python-worker"),
      ARTIFACT_ROOT: "data/artifacts",
    },
  });
  await waitForHttp(`${workerUrl}/health`, "worker", worker);

  const demo = spawnProcess(
    "npm.cmd",
    ["run", "dev", "--workspace", "@ui-sentinel/demo-react-app", "--", "--port", demoPort],
    { shell: true },
  );
  await waitForHttp(demoUrl, "demo-react-app", demo);

  const project = await request(controlUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: `Task 4.5 validation ${unique}`,
      local_path: "apps/demo-react-app",
    }),
  });

  const run = await request(controlUrl, "/api/runs", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      target_url: demoUrl,
      task_goal: "Open the demo login page, submit the empty form, and collect browser evidence.",
    }),
  });

  const ssePromise = waitForBrowserSse(run.id);

  const workerResponse = await request(workerUrl, "/internal/browser/run", {
    method: "POST",
    body: JSON.stringify({
      run_id: run.id,
      target_url: demoUrl,
      task_goal: "Open the demo login page, submit the empty form, and collect browser evidence.",
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

  const artifactDir = path.join(root, "data", "artifacts", run.id);
  const screenshotPath = path.join(artifactDir, "screenshot_001.png");
  const domPath = path.join(artifactDir, "dom_snapshot_001.html");
  const networkPath = path.join(artifactDir, "network_events.json");
  const consolePath = path.join(artifactDir, "console_logs.json");

  for (const artifactPath of [screenshotPath, domPath, networkPath, consolePath]) {
    if (!existsSync(artifactPath)) {
      throw new Error(`Missing artifact: ${artifactPath}`);
    }
  }

  const dom = readFileSync(domPath, "utf8");
  const network = JSON.parse(readFileSync(networkPath, "utf8"));
  const loginResponse = network.find(
    (entry) =>
      entry.kind === "response" &&
      entry.url.endsWith("/api/login") &&
      entry.status === 401,
  );

  const passwordErrorVisible = dom.includes("Password is required");
  const emailErrorMissing = !dom.includes("Email is required");

  if (!passwordErrorVisible || !emailErrorMissing || !loginResponse) {
    throw new Error("Demo bug evidence was not captured in DOM/network artifacts.");
  }

  console.log(
    JSON.stringify(
      {
        project_id: project.id,
        run_id: run.id,
        demo_url: demoUrl,
        worker_status: workerResponse.status,
        required_events_present: missingTypes.length === 0,
        sse_received_browser_completed: sseChunk.includes("browser.completed"),
        password_error_visible: passwordErrorVisible,
        email_error_missing: emailErrorMissing,
        fake_login_401_captured: Boolean(loginResponse),
        artifacts: {
          screenshot: screenshotPath,
          dom_snapshot: domPath,
          network_events: networkPath,
          console_logs: consolePath,
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
