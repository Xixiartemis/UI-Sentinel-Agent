# Python Worker

Task 4 implements a FastAPI browser worker that uses Playwright directly for the
MVP. Task 6 adds the codebase indexer. Task 7 adds hybrid retrieval over indexed
chunks. The worker does not consume BullMQ and does not run Docker.

## Scope

Implemented:

- `POST /internal/browser/run`
- Chromium navigation through Playwright.
- Screenshot capture.
- DOM snapshot capture.
- Console log collection.
- Network request/response collection.
- Local artifact storage.
- Structured `browser.*` event callbacks to the NestJS control plane.
- `run.failed` event callback on errors.
- `POST /internal/indexer/run` for indexing React TypeScript source.
- TypeScript / TSX chunking for files under `src/`.
- PostgreSQL `code_chunks` replacement per project.
- Deterministic mock embeddings when `EMBEDDING_API_KEY` is missing.
- Structured `indexer.*` event callbacks to the NestJS control plane.
- `POST /internal/retrieval/query` for pgvector + PostgreSQL full-text retrieval.
- Structured `rag.retrieved` event callbacks to the NestJS control plane.

Not implemented:

- Diagnosis or verifier agents.
- Frontend pages.
- Auto-fix.

## Setup

From `apps/python-worker`:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
```

If `python` is not available on PATH, install Python 3.10+ or use your local
Python executable explicitly.

## Run

```powershell
uvicorn app.main:app --reload --port 8000
```

The worker stores artifacts under `ARTIFACT_ROOT` when set. If not set, it uses
`ARTIFACTS_ROOT`, then falls back to:

```text
data/artifacts
```

Artifact paths:

```text
data/artifacts/{run_id}/screenshot_001.png
data/artifacts/{run_id}/dom_snapshot_001.html
data/artifacts/{run_id}/network_events.json
data/artifacts/{run_id}/console_logs.json
```

## API

```http
POST /internal/browser/run
```

Example:

```powershell
curl -X POST http://127.0.0.1:8000/internal/browser/run `
  -H "Content-Type: application/json" `
  -d '{
    "run_id": "RUN_ID",
    "target_url": "https://example.com",
    "task_goal": "Open the page and collect browser evidence.",
    "event_callback_url": "http://127.0.0.1:3000/internal/runs/RUN_ID/events"
  }'
```

```http
POST /internal/indexer/run
```

Example:

```powershell
curl -X POST http://127.0.0.1:8000/internal/indexer/run `
  -H "Content-Type: application/json" `
  -d '{
    "project_id": "PROJECT_ID",
    "run_id": "RUN_ID",
    "local_path": "apps/demo-react-app",
    "event_callback_url": "http://127.0.0.1:3100/internal/runs/RUN_ID/events"
  }'
```

The indexer scans `src/**/*.ts` and `src/**/*.tsx`, excluding folders such as
`node_modules`, `dist`, `build`, `.git`, and `coverage`, plus `.env` files. It
does not exclude normal source files only because they contain words like
`password`, `token`, `key`, or `login`.

Generated chunk types include:

- `file`
- `component`
- `function`
- `hook`
- `api_module`
- `validation`
- `route_or_page`

Task 6 uses deterministic mock embeddings with dimension `1536` unless a real
embedding provider is configured through:

```dotenv
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
```

```http
POST /internal/retrieval/query
```

Example:

```powershell
curl -X POST http://127.0.0.1:8000/internal/retrieval/query `
  -H "Content-Type: application/json" `
  -d '{
    "project_id": "PROJECT_ID",
    "run_id": "RUN_ID",
    "query": "LoginForm email password validation",
    "top_k": 5,
    "event_callback_url": "http://127.0.0.1:3100/internal/runs/RUN_ID/events"
  }'
```

The retrieval endpoint returns `rewritten_queries` plus ranked matches with:

- `chunk_id`
- `file_path`
- `start_line`
- `end_line`
- `chunk_type`
- `symbol_name`
- `vector_score`
- `keyword_score`
- `final_score`
- `content`

Task 7 uses deterministic query rewriting and weighted score merging:

```text
final_score = 0.6 * vector_score + 0.4 * keyword_score
```

No external reranker is used in the MVP.

## Validation

1. Start the NestJS control plane:

```powershell
npm run start --workspace @ui-sentinel/control-plane
```

2. Start the Python worker:

```powershell
cd apps/python-worker
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

3. Create a project and run through the control plane.

4. Call `POST /internal/browser/run` using the run id.

5. Confirm historical events:

```powershell
curl http://127.0.0.1:3000/api/runs/RUN_ID/events
```

Expected event types:

- `browser.started`
- `browser.step`
- `browser.screenshot`
- `browser.dom_snapshot`
- `browser.console`
- `browser.network`
- `browser.completed`

6. Confirm artifacts exist under `data/artifacts/{run_id}/`.

Task 6 indexer validation from the repository root:

```powershell
node scripts/validate-task6.mjs
```

Expected result:

- More than 10 chunks for `apps/demo-react-app`.
- Login-related chunks are present.
- Component or validation chunks are present.
- Embeddings are stored with 1536 dimensions.
- Historical run events include `indexer.started`, `indexer.file_scanned`,
  `indexer.chunk_created`, `indexer.embedding_created`, and
  `indexer.completed`.

Task 7 retrieval validation from the repository root:

```powershell
node scripts/validate-task7.mjs
```

Expected result:

- Demo React app source is indexed.
- Retrieval returns `src/components/LoginForm.tsx`.
- Returned match includes valid line numbers and a positive final score.
- Historical run events include `rag.retrieved`.
