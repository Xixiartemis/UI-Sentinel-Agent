from pathlib import Path

from fastapi import FastAPI

from .browser_runner import BrowserRunner
from .config import get_settings
from .diagnosis import DiagnosisService
from .indexer import CodebaseIndexer
from .retrieval import RetrievalService
from .schemas import (
    BrowserRunRequest,
    BrowserRunResponse,
    DiagnosisRunRequest,
    DiagnosisRunResponse,
    IndexerRunRequest,
    IndexerRunResponse,
    RetrievalQueryRequest,
    RetrievalQueryResponse,
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


@app.post("/internal/retrieval/query", response_model=RetrievalQueryResponse)
async def query_retrieval(request: RetrievalQueryRequest) -> RetrievalQueryResponse:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required for retrieval.")

    retrieval = RetrievalService(
        database_url=settings.database_url,
        embedding_dimension=settings.embedding_dimension,
    )
    return await retrieval.query(request)


@app.post("/internal/diagnosis/run", response_model=DiagnosisRunResponse)
async def run_diagnosis(request: DiagnosisRunRequest) -> DiagnosisRunResponse:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required for diagnosis.")

    diagnosis = DiagnosisService(
        database_url=settings.database_url,
        embedding_dimension=settings.embedding_dimension,
        llm_api_key=settings.llm_api_key,
    )
    return await diagnosis.run(request)
