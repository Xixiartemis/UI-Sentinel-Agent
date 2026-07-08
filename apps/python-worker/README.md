# Python Worker

Task 4 implements a FastAPI browser worker that uses Playwright directly for the
MVP. It does not consume BullMQ, does not run Docker, and does not require
`browser-use` integration yet.

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

Not implemented:

- Codebase indexing.
- RAG retrieval.
- Diagnosis or verifier agents.
- Demo React app.
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
