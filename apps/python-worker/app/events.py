from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx

from .schemas import RunEvent


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class EventClient:
    def __init__(self, callback_url: str, agent: str = "browser") -> None:
        self.callback_url = callback_url
        self.agent = agent

    async def post(
        self,
        *,
        run_id: str,
        event_type: str,
        status: str,
        payload: dict[str, Any],
    ) -> RunEvent:
        event = RunEvent(
            event_id=f"evt_{uuid4().hex}",
            run_id=run_id,
            timestamp=utc_now_iso(),
            agent=self.agent,
            type=event_type,
            status=status,
            payload=payload,
        )

        async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
            response = await client.post(
                self.callback_url,
                json=event.model_dump(),
            )
            response.raise_for_status()

        return event
