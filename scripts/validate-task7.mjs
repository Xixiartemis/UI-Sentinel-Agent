import "dotenv/config";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const controlPort = process.env.VALIDATE_TASK7_CONTROL_PORT ?? "3100";
const workerPort = process.env.VALIDATE_TASK7_WORKER_PORT ?? "8001";
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

try {
  if (!existsSync(pythonExe)) {
    throw new Error(`Python worker virtualenv not found: ${pythonExe}`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Task 7 validation.");
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
      name: `Task 7 validation ${unique}`,
      local_path: "apps/demo-react-app",
    }),
  });

  const run = await request(controlUrl, "/api/runs", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      target_url: "http://127.0.0.1:5273/",
      task_goal: "Retrieve code responsible for the missing email required validation.",
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

  const retrieval = await request(workerUrl, "/internal/retrieval/query", {
    method: "POST",
    body: JSON.stringify({
      project_id: project.id,
      run_id: run.id,
      query: "LoginForm email password validation",
      top_k: 5,
      event_callback_url: `${controlUrl}/internal/runs/${run.id}/events`,
    }),
  });

  if (!Array.isArray(retrieval.rewritten_queries) || retrieval.rewritten_queries.length < 1) {
    throw new Error("Expected rewritten queries.");
  }
  if (!Array.isArray(retrieval.matches) || retrieval.matches.length < 1) {
    throw new Error("Expected retrieval matches.");
  }

  const loginFormMatch = retrieval.matches.find((match) =>
    match.file_path.includes("LoginForm.tsx"),
  );
  if (!loginFormMatch) {
    throw new Error("Expected retrieval to return LoginForm.tsx.");
  }
  if (loginFormMatch.start_line < 1 || loginFormMatch.end_line < loginFormMatch.start_line) {
    throw new Error("Expected LoginForm.tsx match to include valid line numbers.");
  }
  if (typeof loginFormMatch.final_score !== "number" || loginFormMatch.final_score <= 0) {
    throw new Error("Expected LoginForm.tsx match to include a positive final score.");
  }

  const events = await request(controlUrl, `/api/runs/${run.id}/events`);
  const ragEvent = events.find((event) => event.type === "rag.retrieved");
  if (!ragEvent) {
    throw new Error("Expected rag.retrieved event.");
  }

  console.log(
    JSON.stringify(
      {
        project_id: project.id,
        run_id: run.id,
        rewritten_queries: retrieval.rewritten_queries,
        match_count: retrieval.matches.length,
        login_form_match: {
          chunk_id: loginFormMatch.chunk_id,
          file_path: loginFormMatch.file_path,
          start_line: loginFormMatch.start_line,
          end_line: loginFormMatch.end_line,
          chunk_type: loginFormMatch.chunk_type,
          symbol_name: loginFormMatch.symbol_name,
          vector_score: loginFormMatch.vector_score,
          keyword_score: loginFormMatch.keyword_score,
          final_score: loginFormMatch.final_score,
        },
        rag_retrieved_event_present: true,
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
