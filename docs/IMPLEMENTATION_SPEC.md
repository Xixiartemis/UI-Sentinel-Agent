# UI Sentinel Agent - Implementation Specification

**Target:**  Codex / AI Development Assistants**Instruction:**  Follow this specification strictly. Do not implement out-of-scope features. Prioritize simple, working implementations over abstract generic frameworks.

## 1. MVP Scope

**Goal:**  Run an end-to-end diagnosis on a single React demo app for a specific UI bug.**Demo Case:**  A login page (`demo-react-app`) where submitting an empty form shows a password error but misses the email error.**In Scope:**

* Project & Run creation.
* Python Browser Agent execution (capturing screenshots, DOM, console, network).
* Codebase Indexing (TS/TSX via `tree-sitter`, storing in Postgres `pgvector`).
* Hybrid Retrieval (pgvector + Postgres Full-text).
* Evidence-based Diagnosis & Verifier.
* React Frontend with real-time SSE Agent Timeline and Evidence Panels.**Out of Scope (DO NOT IMPLEMENT):**
* Auto-fixing code or GitHub PR creation.
* Complex multi-page flows or authenticated scraping.
* Incremental indexing for large monorepos.
* Production multi-tenancy or complex auth.

## 2. Tech Stack

* **Frontend:**  Vite + React + TypeScript + Tailwind CSS + Zustand + TanStack Query.
* **Control Plane:**  NestJS + Prisma.
* **Database:**  PostgreSQL (with `pgvector` extension).
* **Queue/Realtime:**  Redis (BullMQ for jobs, optional Streams).
* **Execution Worker:**  Python 3.10+ + FastAPI + Playwright + `browser-use` + `tree-sitter`.
* **Storage (MVP):**  Local filesystem (`/data/artifacts/`).

## 3. Monorepo Structure

```
ui-sentinel-agent/
├── apps/
│   ├── frontend/               # Vite React App
│   ├── control-plane/          # NestJS Server
│   ├── python-worker/          # FastAPI & Agents
│   └── demo-react-app/         # Buggy target app for MVP testing
├── packages/
│   └── shared-types/           # Shared TypeScript interfaces
├── docker/                     # docker-compose.yml (Postgres, Redis)
└── docs/                       # SDD.md, IMPLEMENTATION_SPEC.md
```

## 4. Database Schema (Prisma Overview)

```
model Project {
  id          String   @id @default(uuid())
  name        String
  local_path  String
  runs        Run[]
  chunks      CodeChunk[]
}

model CodeChunk {
  id            String   @id @default(uuid())
  project_id    String
  file_path     String
  chunk_type    String   // 'component', 'hook', 'file'
  symbol_name   String
  start_line    Int
  end_line      Int
  content       String
  embedding     Unsupported("vector(1536)")? 
  // + Postgres tsvector for full-text search
}

model Run {
  id          String     @id @default(uuid())
  project_id  String
  target_url  String
  task_goal   String
  status      String     // 'queued', 'running', 'completed', 'failed'
  events      RunEvent[]
  artifacts   Artifact[]
}

model RunEvent {
  id           String   @id @default(uuid())
  run_id       String
  sequence     Int      @default(autoincrement())
  event_type   String   // e.g., 'browser.step'
  agent_name   String
  payload_json Json
  created_at   DateTime @default(now())
}

model Artifact {
  id            String   @id @default(uuid())
  run_id        String
  artifact_type String   // 'screenshot', 'dom'
  storage_key   String
  created_at    DateTime @default(now())
}
```

## 5. API Contracts

**Frontend -&gt;**  **NestJS (Public API):**

* `POST /api/projects`
* `POST /api/projects/:id/index`
* `POST /api/runs` (Body: `{ project_id, target_url, task_goal }`)
* `GET /api/runs/:id`
* `GET /api/runs/:id/stream` (SSE Endpoint)
* `GET /api/artifacts/:key` (Serve static files)

**Python Worker -&gt;**  **NestJS (Internal API):**

* `POST /internal/runs/:id/events` (Push structured event, DB insert + SSE broadcast)
* `POST /internal/runs/:id/artifacts` (Register artifact metadata)

## 6. Event Schema (Standardized)

All long-running tasks emit events conforming to this schema.

```
{
  "event_id": "evt_123",
  "run_id": "run_001",
  "timestamp": "2026-07-02T10:00:00.000Z",
  "agent": "browser",
  "type": "browser.step",
  "status": "running",
  "payload": {
    "action": "fill",
    "target": "password_input",
    "thought": "Entering invalid password to trigger validation."
  }
}
```

*Event Types:*  `run.started`, `browser.started`, `browser.step`, `browser.screenshot`, `browser.network`, `rag.retrieved`, `diagnosis.completed`, `run.completed`.

## 7. Agent I/O Schemas

**Retrieval Output:**

```
{
  "rewritten_queries": ["LoginForm email required"],
  "matches": [{
    "chunk_id": "chk_123",
    "file_path": "src/components/LoginForm.tsx",
    "start_line": 20,
    "end_line": 50,
    "final_score": 0.88
  }]
}
```

**Diagnosis &amp; Verifier Output:**

```
{
  "summary": "Email required validation is missing.",
  "severity": "medium",
  "claims": [{
    "text": "Empty submit shows no email error.",
    "evidence_ids": ["art_dom_001", "art_shot_001"]
  }],
  "fix_suggestions": [{
    "file_path": "src/components/LoginForm.tsx",
    "suggestion": "Add email validation to zod schema."
  }],
  "verifier_result": {
    "verified": true,
    "unsupported_claims": []
  }
}
```

## 8. RAG MVP Design

* **Chunking Rules (****`tree-sitter`** **):**  Scan `src//*.ts/tsx`. Exclude `node_modules`, `dist`, `.git`. Generate `file-level` chunks. Extract React components into `component-level` chunks. Include `file_path`, `start_line`, `end_line`.
* **Retrieval MVP:**

  1. Rewrite query based on task + browser evidence.
  2. pgvector search (Top 20).
  3. Postgres full-text search (Top 20).
  4. Merge. Final Score \= `0.6 * vector_score + 0.4 * keyword_score`.
  5. Return Top 5.

## 9. Frontend Pages & Layout

* **Dashboard:**  List projects, index status, create run.
* **Run Workspace (Core):**

  * *Top:*  Run metadata, Status badge.
  * *Left:*  Agent Timeline (Vertical list of `RunEvent` cards via SSE).
  * *Center:*  Browser Evidence Panel (Tabs: Screenshot, DOM, Console, Network Table).
  * *Right:*  Code RAG Panel (Query, Matched chunks snippet view).
  * *Bottom:*  Diagnosis Report Card & Verifier Badge.

## 10. Error Handling & Security

* **Error Logging:**  All failures (e.g., selector not found, indexing crash) MUST write a `run.failed` event to the database and terminate gracefully.
* **Security:**  DO NOT index `.env` or files containing `secret`, `key`, `password`. Python Worker MUST NOT execute arbitrary shell commands. Keep LLM API keys only in `.env` of backend/worker.

## 11. Acceptance Criteria

1. Project creation and codebase indexing yield \>10 valid code chunks.
2. Starting a run streams `browser.step` events to the React frontend via SSE.
3. Browser Agent successfully captures at least 1 screenshot, DOM snapshot, and network trace.
4. RAG returns `LoginForm.tsx` with lines and score.
5. Diagnosis Agent outputs a JSON report with `evidence_ids`.
6. Verifier Agent confirms all claims have valid evidence.

## 12. Codex Task Split (Milestones)

* **Task 1:**  Create Monorepo, Docker Compose (PG+Redis), Shared Types.
* **Task 2:**  NestJS Control Plane (Prisma setup, Projects/Runs API).
* **Task 3:**  NestJS Event System & SSE streaming endpoint.
* **Task 4:**  Python Worker Setup & Playwright/browser-use basic execution.
* **Task 5:**  Demo React App with deliberate form validation bugs.
* **Task 6:**  Python Indexer (`tree-sitter` chunking + pgvector insert).
* **Task 7:**  Retrieval Service (Hybrid search logic).
* **Task 8:**  Diagnosis & Verifier Agents (LLM integration with JSON schemas).
* **Task 9:**  React Frontend Run Workspace (SSE connection + UI components).
* **Task 10:**  End-to-end integration test & README.

## 13. Codex Execution Corrections

### 13.1 Queue Ownership

MVP must not make Python consume BullMQ jobs directly.

Correct flow:

1. NestJS receives public API requests.
2. NestJS creates BullMQ jobs.
3. NestJS Queue Processor consumes BullMQ jobs.
4. NestJS Queue Processor calls Python Worker via internal HTTP APIs.
5. Python Worker executes browser/indexing/diagnosis tasks.
6. Python Worker sends structured events back to NestJS via `/internal/runs/:id/events`.
7. NestJS persists events into PostgreSQL and pushes them to frontend through SSE.

Redis is used for BullMQ in MVP. Redis Streams are optional V2 and must not be required for MVP.

### 13.2 Event Source of Truth

PostgreSQL `run_events` is the only source of truth for historical events.

SSE only streams live events. If the frontend reconnects, it must call:

`GET /api/runs/:id/events`

to recover historical events and then reconnect to:

`GET /api/runs/:id/stream`.

### 13.3 Artifact API

Do not use `GET /api/artifacts/:key` because storage keys may contain `/`.

Use:

`GET /api/artifacts/:id`

The backend resolves `artifact.id` to `storage_key` and serves the file.

### 13.4 Embedding Model

MVP embedding provider:

* Model: `text-embedding-3-small`
* Dimension: `1536`

If `EMBEDDING_API_KEY` is missing, use deterministic mock embeddings for local demo only.

### 13.5 Security Filter Correction

Do not exclude normal source files only because they contain words like `password`, `token`, or `key`.

Exclude only:

* `.env`, `.env.*`
* `.pem`, `.key`, private key files
* files under credential/secret folders
* files whose filename clearly indicates secret dumps

For normal source code, redact suspicious literal credential values but keep the file indexed.

### 13.6 Rerank MVP

MVP does not call an external reranker.

Use weighted score merging:

`final_score = 0.6 * normalized_vector_score + 0.4 * normalized_keyword_score`

External rerankers are V2.

### 13.7 LLM Provider and Mock Mode

Default LLM provider is OpenAI-compatible Chat Completions.

Environment variables:

* `LLM_API_KEY`
* `LLM_BASE_URL`
* `LLM_MODEL`
* `EMBEDDING_API_KEY`
* `EMBEDDING_MODEL`

If `LLM_API_KEY` is missing, Diagnosis Agent and Verifier Agent must return deterministic mock outputs for the MVP demo case.

### 13.8 Implementation Rule

Do not implement all milestones in one step.

Each milestone must:

1. Compile successfully.
2. Include minimal tests or a manual verification command.
3. Update README or docs when behavior changes.
4. Avoid implementing out-of-scope features.