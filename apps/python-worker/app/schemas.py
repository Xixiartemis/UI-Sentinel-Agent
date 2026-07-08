from typing import Any, Literal
from pydantic import BaseModel, Field, HttpUrl


class BrowserRunRequest(BaseModel):
    run_id: str = Field(min_length=1)
    target_url: HttpUrl
    task_goal: str = Field(min_length=1)
    event_callback_url: HttpUrl


class RunEvent(BaseModel):
    event_id: str
    run_id: str
    timestamp: str
    agent: str
    type: str
    status: str
    payload: dict[str, Any]


class ArtifactMetadata(BaseModel):
    artifact_type: str
    storage_key: str


class BrowserRunResponse(BaseModel):
    run_id: str
    status: Literal["completed"]
    artifacts: list[ArtifactMetadata]
    console_log_count: int
    network_event_count: int


class IndexerRunRequest(BaseModel):
    project_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    local_path: str = Field(min_length=1)
    event_callback_url: HttpUrl


class CodeChunk(BaseModel):
    project_id: str
    file_path: str
    language: str = "typescript"
    chunk_type: str
    symbol_name: str
    start_line: int
    end_line: int
    content: str
    content_hash: str
    metadata_json: dict[str, Any]


class IndexerRunResponse(BaseModel):
    project_id: str
    run_id: str
    file_count: int
    chunk_count: int
    embedding_dimension: int
    mock_embeddings: bool
