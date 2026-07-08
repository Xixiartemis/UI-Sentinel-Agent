import { access } from "node:fs/promises";

const requiredPaths = [
  "apps/frontend",
  "apps/control-plane",
  "apps/python-worker",
  "apps/demo-react-app",
  "packages/shared-types",
  "docker",
  "docs",
];

const missingPaths = [];

for (const path of requiredPaths) {
  try {
    await access(path);
  } catch {
    missingPaths.push(path);
  }
}

if (missingPaths.length > 0) {
  console.error(`Missing required paths: ${missingPaths.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Task 1 monorepo structure verified.");
}
