from functools import lru_cache
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv
import os


load_dotenv()


class Settings(BaseModel):
    artifact_root: Path = Path(
        os.getenv("ARTIFACT_ROOT")
        or os.getenv("ARTIFACTS_ROOT")
        or "data/artifacts"
    )
    browser_timeout_ms: int = int(os.getenv("BROWSER_TIMEOUT_MS", "30000"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
