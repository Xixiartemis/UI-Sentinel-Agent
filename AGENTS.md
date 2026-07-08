# AGENTS.md - UI Sentinel Agent

## Project

UI Sentinel Agent is an MVP frontend quality diagnosis system.

It combines:

* Browser runtime evidence from Playwright / browser-use
* Codebase RAG over React / TypeScript source code
* Evidence-based LLM diagnosis
* Verifier checks to reject unsupported claims

The MVP must diagnose a single deliberate login form validation bug in `apps/demo-react-app`.

## Documents

Always follow these documents:

* `docs/SDD.md`
* `docs/IMPLEMENTATION_SPEC.md`

If there is a conflict, follow `docs/IMPLEMENTATION_SPEC.md`.

## MVP Rules

Do not implement out-of-scope features:

* No auto-fixing code
* No GitHub PR creation
* No complex multi-page flows
* No production multi-tenancy
* No Kubernetes
* No Milvus or Elasticsearch
* No external reranker in MVP

Prioritize simple working implementations over abstract frameworks.

## Architecture Rules

Use this architecture:

* Frontend: Vite + React + TypeScript
* Control Plane: NestJS + Prisma
* Worker: Python FastAPI + Playwright + browser-use
* Database: PostgreSQL + pgvector
* Queue: Redis + BullMQ
* Storage: local filesystem under `/data/artifacts`

Important constraints:

1. Do not keep or extend the original Gradio UI from browser-use/web-ui.
2. Reuse browser-use / Playwright only on the Python execution side.
3. NestJS is the control plane. It owns public APIs, task orchestration, event persistence, and SSE.
4. Python Worker must not consume BullMQ directly.
5. NestJS Queue Processor consumes BullMQ jobs and calls Python Worker through internal HTTP APIs.
6. PostgreSQL `run_events` is the source of truth for historical events.
7. SSE is only for live streaming.
8. Large artifacts must not be stored in PostgreSQL or sent as Base64.
9. Diagnosis claims must include evidence IDs.
10. Verifier must reject claims without evidence.

## Development Workflow

Implement one task at a time.

After each task:

1. Run available build/test/lint commands.
2. Ensure the app still starts.
3. Update README or docs if setup changes.
4. Do not start the next milestone until the current one works.

## Task Order

Follow this order:

1. Monorepo + Docker Compose
2. NestJS Control Plane + Prisma
3. Event system + SSE
4. Python Browser Worker
5. Demo React App
6. Codebase Indexer
7. Retrieval Service
8. Diagnosis + Verifier
9. Frontend Run Workspace
10. End-to-end README and verification

## Coding Standards

* TypeScript must use strict types where practical.
* Python APIs must use Pydantic schemas.
* All event payloads must follow the shared event schema.
* Avoid hidden global state.
* Use environment variables for service URLs and API keys.
* Provide mock mode when LLM or embedding API keys are missing.

## Security Rules

* Do not index `.env`, `.env.*`, private keys, credential dumps, or secret files.
* Do not exclude normal source files just because they contain words like `password`, `token`, or `key`.
* Redact suspicious literal credentials when detected.
* Python Worker must not execute arbitrary shell commands.
* LLM API keys must never be exposed to the frontend.

## Verification

The MVP is complete only when:

1. Project creation works.
2. Demo app indexing generates more than 10 chunks.
3. Starting a run streams browser events through SSE.
4. Browser Worker captures screenshot, DOM, console, and network evidence.
5. Retrieval returns `LoginForm.tsx` with line numbers and score.
6. Diagnosis outputs JSON with evidence IDs.
7. Verifier confirms all claims are evidence-backed.
8. Frontend displays timeline, evidence panels, RAG panel, and diagnosis report.