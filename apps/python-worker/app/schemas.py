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
    agent: Literal["browser"] = "browser"
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
