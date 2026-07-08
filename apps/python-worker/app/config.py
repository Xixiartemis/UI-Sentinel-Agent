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
    database_url: str | None = os.getenv("DATABASE_URL")
    embedding_api_key: str | None = os.getenv("EMBEDDING_API_KEY")
    embedding_base_url: str | None = os.getenv("EMBEDDING_BASE_URL")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    embedding_dimension: int = 1536


@lru_cache
def get_settings() -> Settings:
    return Settings()
