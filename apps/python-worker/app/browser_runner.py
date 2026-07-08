import json
from pathlib import Path
from typing import Any

from playwright.async_api import Request, Response, async_playwright

from .events import EventClient
from .schemas import ArtifactMetadata, BrowserRunRequest, BrowserRunResponse


class BrowserRunner:
    def __init__(self, artifact_root: Path, timeout_ms: int) -> None:
        self.artifact_root = artifact_root
        self.timeout_ms = timeout_ms

    async def run(self, request: BrowserRunRequest) -> BrowserRunResponse:
        run_dir = self.artifact_root / request.run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        callback = EventClient(str(request.event_callback_url))
        console_logs: list[dict[str, Any]] = []
        network_events: list[dict[str, Any]] = []
        artifacts: list[ArtifactMetadata] = []

        await callback.post(
            run_id=request.run_id,
            event_type="browser.started",
            status="running",
            payload={
                "target_url": str(request.target_url),
                "task_goal": request.task_goal,
            },
        )

        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page()
                page.set_default_timeout(self.timeout_ms)

                page.on(
                    "console",
                    lambda message: console_logs.append(
                        {
                            "type": message.type,
                            "text": message.text,
                            "location": message.location,
                        }
                    ),
                )
                page.on("request", lambda req: self._record_request(network_events, req))
                page.on("response", lambda res: self._record_response(network_events, res))

                await callback.post(
                    run_id=request.run_id,
                    event_type="browser.step",
                    status="running",
                    payload={
                        "action": "navigate",
                        "target": str(request.target_url),
                    },
                )

                await page.goto(str(request.target_url), wait_until="networkidle")
                await self._submit_login_form_if_present(page, callback, request.run_id)

                screenshot_path = run_dir / "screenshot_001.png"
                await page.screenshot(path=str(screenshot_path), full_page=True)
                screenshot_artifact = ArtifactMetadata(
                    artifact_type="screenshot",
                    storage_key=self._storage_key(screenshot_path),
                )
                artifacts.append(screenshot_artifact)
                await callback.post(
                    run_id=request.run_id,
                    event_type="browser.screenshot",
                    status="running",
                    payload=screenshot_artifact.model_dump(),
                )

                dom_path = run_dir / "dom_snapshot_001.html"
                dom_path.write_text(await page.content(), encoding="utf-8")
                dom_artifact = ArtifactMetadata(
                    artifact_type="dom",
                    storage_key=self._storage_key(dom_path),
                )
                artifacts.append(dom_artifact)
                await callback.post(
                    run_id=request.run_id,
                    event_type="browser.dom_snapshot",
                    status="running",
                    payload=dom_artifact.model_dump(),
                )

                console_path = run_dir / "console_logs.json"
                console_path.write_text(
                    json.dumps(console_logs, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                console_artifact = ArtifactMetadata(
                    artifact_type="console",
                    storage_key=self._storage_key(console_path),
                )
                artifacts.append(console_artifact)
                await callback.post(
                    run_id=request.run_id,
                    event_type="browser.console",
                    status="running",
                    payload={
                        **console_artifact.model_dump(),
                        "count": len(console_logs),
                    },
                )

                network_path = run_dir / "network_events.json"
                network_path.write_text(
                    json.dumps(network_events, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                network_artifact = ArtifactMetadata(
                    artifact_type="network",
                    storage_key=self._storage_key(network_path),
                )
                artifacts.append(network_artifact)
                await callback.post(
                    run_id=request.run_id,
                    event_type="browser.network",
                    status="running",
                    payload={
                        **network_artifact.model_dump(),
                        "count": len(network_events),
                    },
                )

                await browser.close()

            await callback.post(
                run_id=request.run_id,
                event_type="browser.completed",
                status="completed",
                payload={
                    "artifact_count": len(artifacts),
                    "console_log_count": len(console_logs),
                    "network_event_count": len(network_events),
                },
            )

            return BrowserRunResponse(
                run_id=request.run_id,
                status="completed",
                artifacts=artifacts,
                console_log_count=len(console_logs),
                network_event_count=len(network_events),
            )
        except Exception as error:
            await callback.post(
                run_id=request.run_id,
                event_type="run.failed",
                status="failed",
                payload={
                    "error": str(error),
                },
            )
            raise

    def _record_request(self, events: list[dict[str, Any]], request: Request) -> None:
        events.append(
            {
                "kind": "request",
                "method": request.method,
                "url": request.url,
                "resource_type": request.resource_type,
            }
        )

    def _record_response(self, events: list[dict[str, Any]], response: Response) -> None:
        events.append(
            {
                "kind": "response",
                "status": response.status,
                "url": response.url,
            }
        )

    def _storage_key(self, path: Path) -> str:
        return path.as_posix()

    async def _submit_login_form_if_present(
        self,
        page: Any,
        callback: EventClient,
        run_id: str,
    ) -> None:
        login_button = page.get_by_role("button", name="Login")

        if await login_button.count() == 0:
            return

        await callback.post(
            run_id=run_id,
            event_type="browser.step",
            status="running",
            payload={
                "action": "click",
                "target": "Login button",
            },
        )
        await login_button.first.click()
        await page.wait_for_load_state("networkidle")
