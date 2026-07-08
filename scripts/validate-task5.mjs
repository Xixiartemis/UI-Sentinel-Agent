import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const demoUrl = "http://127.0.0.1:5173/";
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

async function waitForDemo(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Demo app exited early:\n${child.output}`);
    }

    try {
      const response = await fetch(demoUrl);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timed out waiting for demo app:\n${child.output}`);
}

const validationCode = String.raw`
import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        requests = []
        page.on("request", lambda request: requests.append({"method": request.method, "url": request.url}))
        await page.goto("http://127.0.0.1:5173/", wait_until="networkidle")
        await page.get_by_role("button", name="Login").click()
        await page.wait_for_timeout(500)
        body_text = await page.locator("body").inner_text()
        login_requests = [item for item in requests if item["method"] == "POST" and item["url"].endswith("/api/login")]
        result = {
            "password_error_visible": "Password is required" in body_text,
            "email_error_missing": "Email is required" not in body_text,
            "fake_login_request_triggered": len(login_requests) > 0,
            "login_request_count": len(login_requests),
        }
        await browser.close()
        print(json.dumps(result, indent=2))
        if not all([result["password_error_visible"], result["email_error_missing"], result["fake_login_request_triggered"]]):
            raise SystemExit(1)

asyncio.run(main())
`;

try {
  if (!existsSync(pythonExe)) {
    throw new Error(`Python worker virtualenv not found: ${pythonExe}`);
  }

  const demo = spawnProcess("npm.cmd", ["run", "dev", "--workspace", "@ui-sentinel/demo-react-app"], {
    shell: true,
  });
  await waitForDemo(demo);

  const validation = spawn(pythonExe, ["-c", validationCode], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  validation.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  validation.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      validation.kill();
      reject(new Error(`Playwright validation timed out:\n${output}`));
    }, 30_000);
    validation.on("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  process.stdout.write(output);

  if (exitCode !== 0) {
    throw new Error("Demo validation failed.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  for (const child of processes) {
    console.error(`\n--- process ${child.pid} output ---\n${child.output}`);
  }
  process.exitCode = 1;
} finally {
  await stopProcesses();
}
