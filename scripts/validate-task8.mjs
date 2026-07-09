import "dotenv/config";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const controlPort = process.env.VALIDATE_TASK8_CONTROL_PORT ?? "3100";
const workerPort = process.env.VALIDATE_TASK8_WORKER_PORT ?? "8002";
const demoPort = process.env.VALIDATE_TASK8_DEMO_PORT ?? "5273";
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
  const deadline = Date.now() + 45_000;
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

try {
  if (!existsSync(pythonExe)) {
    throw new Error(`Python worker virtualenv not found: ${pythonExe}`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Task 8 validation.");
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

  if (!(await isHttpAvailable(demoUrl))) {
    const demo = spawnProcess("npm.cmd", ["run", "dev", "--workspace", "@ui-sentinel/demo-react-app"], {
      env: {
        ...process.env,
        PORT: demoPort,
      },
    });
    await waitForHttp(demoUrl, "demo-react-app", demo);
  }

  const worker = spawnProcess(
    pythonExe,
    ["-m", "uvicorn", "app.main:app", "--port", workerPort],
    {
      env: {
        ...process.env,
        PYTHONPATH: path.join(root, "apps", "python-worker"),
      },
    },
  );
  await waitForHttp(`${workerUrl}/health`, "worker", worker);

  const project = await request(controlUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: `Task 8 validation ${unique}`,
      local_path: "apps/demo-react-app",
    }),
  });

  const run = await request(controlUrl, "/api/runs", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      target_url: demoUrl,
      task_goal:
        "Diagnose why empty login submit shows password required but not email required.",
    }),
  });

  await request(workerUrl, "/internal/browser/run", {
    method: "POST",
    body: JSON.stringify({
      run_id: run.id,
      target_url: demoUrl,
      task_goal:
        "Submit the empty login form and collect evidence for missing email validation.",
      event_callback_url: `${controlUrl}/internal/runs/${run.id}/events`,
    }),
  });

  await request(workerUrl, "/internal/indexer/run", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      run_id: run.id,
      local_path: "apps/demo-react-app",
      event_callback_url: `${controlUrl}/internal/runs/${run.id}/events`,
    }),
  });

  const diagnosis = await request(workerUrl, "/internal/diagnosis/run", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      run_id: run.id,
      task_goal:
        "Diagnose why empty login submit shows password required but not email required.",
      query: "LoginForm email password validation",
      top_k: 5,
      event_callback_url: `${controlUrl}/internal/runs/${run.id}/events`,
    }),
  });

  if (!diagnosis.report_id) {
    throw new Error("Expected persisted diagnosis report id.");
  }
  if (!diagnosis.report?.verifier_result?.verified) {
    throw new Error(
      `Expected verifier to approve all claims: ${JSON.stringify(
        diagnosis.report?.verifier_result,
      )}`,
    );
  }
  if (!Array.isArray(diagnosis.report.claims) || diagnosis.report.claims.length < 2) {
    throw new Error("Expected at least two diagnosis claims.");
  }
  for (const claim of diagnosis.report.claims) {
    if (!Array.isArray(claim.evidence_ids) || claim.evidence_ids.length < 1) {
      throw new Error(`Expected claim to include evidence ids: ${claim.text}`);
    }
  }

  const runRecord = await request(controlUrl, `/api/runs/${run.id}`);
  const persistedReport = runRecord.diagnosisReports?.find(
    (report) => report.id === diagnosis.report_id,
  );
  if (!persistedReport) {
    throw new Error("Expected diagnosis report to be visible from GET /api/runs/:id.");
  }

  const events = await request(controlUrl, `/api/runs/${run.id}/events`);
  const eventTypes = new Set(events.map((event) => event.type));
  for (const required of ["rag.retrieved", "diagnosis.started", "diagnosis.completed"]) {
    if (!eventTypes.has(required)) {
      throw new Error(`Missing event: ${required}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        project_id: project.id,
        run_id: run.id,
        report_id: diagnosis.report_id,
        mock_llm: diagnosis.mock_llm,
        summary: diagnosis.report.summary,
        severity: diagnosis.report.severity,
        verified: diagnosis.report.verifier_result.verified,
        claim_count: diagnosis.report.claims.length,
        unsupported_claims: diagnosis.report.verifier_result.unsupported_claims,
        persisted_report_visible: true,
        required_events_present: true,
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
