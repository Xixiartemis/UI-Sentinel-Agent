from fastapi import FastAPI

from .browser_runner import BrowserRunner
from .config import get_settings
from .schemas import BrowserRunRequest, BrowserRunResponse


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
