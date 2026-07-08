from pathlib import Path

from fastapi import FastAPI

from .browser_runner import BrowserRunner
from .config import get_settings
from .indexer import CodebaseIndexer
from .schemas import (
    BrowserRunRequest,
    BrowserRunResponse,
    IndexerRunRequest,
    IndexerRunResponse,
)


app = FastAPI(title="UI Sentinel Python Worker")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/browser/run", response_model=BrowserRunResponse)
async def run_browser_task(request: BrowserRunRequest) -> BrowserRunResponse:
    settings = get_settings()
    runner = BrowserRunner(
        artifact_root=settings.artifact_root,
        timeout_ms=settings.browser_timeout_ms,
    )
    return await runner.run(request)


@app.post("/internal/indexer/run", response_model=IndexerRunResponse)
async def run_indexer(request: IndexerRunRequest) -> IndexerRunResponse:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required for codebase indexing.")

    indexer = CodebaseIndexer(
        database_url=settings.database_url,
        embedding_dimension=settings.embedding_dimension,
    )
    workspace_root = Path(__file__).resolve().parents[3]
    return await indexer.run(request, workspace_root)
