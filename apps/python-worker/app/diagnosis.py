from __future__ import annotations

import json
from dataclasses import dataclass
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from .events import EventClient
from .retrieval import RetrievalService
from .schemas import (
    DiagnosisClaim,
    DiagnosisReport,
    DiagnosisRunRequest,
    DiagnosisRunResponse,
    FixSuggestion,
    RetrievalQueryRequest,
    RetrievalQueryResponse,
    VerifierResult,
)


@dataclass
class RuntimeEvidence:
    event_ids: set[str]
    event_ids_by_type: dict[str, list[str]]
    artifact_ids: set[str]


class DiagnosisService:
    def __init__(
        self,
        *,
        database_url: str,
        embedding_dimension: int = 1536,
        llm_api_key: str | None = None,
    ) -> None:
        self.database_url = database_url
        self.retrieval = RetrievalService(database_url, embedding_dimension)
        self.llm_api_key = llm_api_key
        self.mock_llm = True

    async def run(self, request: DiagnosisRunRequest) -> DiagnosisRunResponse:
        callback = (
            EventClient(str(request.event_callback_url), agent="diagnosis")
            if request.event_callback_url
            else None
        )

        if callback:
            await callback.post(
                run_id=request.run_id,
                event_type="diagnosis.started",
                status="running",
                payload={
                    "project_id": request.project_id,
                    "task_goal": request.task_goal,
                    "mock_llm": self.mock_llm,
                },
            )

        try:
            runtime_evidence = self._load_runtime_evidence(request.run_id)
            retrieval = await self.retrieval.query(
                RetrievalQueryRequest(
                    project_id=request.project_id,
                    run_id=request.run_id if request.event_callback_url else None,
                    query=request.query or request.task_goal,
                    event_callback_url=request.event_callback_url,
                    top_k=request.top_k,
                )
            )

            report = self._mock_report(
                task_goal=request.task_goal,
                runtime_evidence=runtime_evidence,
                retrieval=retrieval,
            )
            report.verifier_result = self._verify(report, runtime_evidence, retrieval)
            report_id = self._persist_report(request.run_id, report)

            response = DiagnosisRunResponse(
                project_id=request.project_id,
                run_id=request.run_id,
                report_id=report_id,
                report=report,
                mock_llm=self.mock_llm,
            )

            if callback:
                await callback.post(
                    run_id=request.run_id,
                    event_type="diagnosis.completed",
                    status="completed",
                    payload={
                        "project_id": request.project_id,
                        "report_id": report_id,
                        "summary": report.summary,
                        "severity": report.severity,
                        "verified": report.verifier_result.verified,
                        "unsupported_claim_count": len(report.verifier_result.unsupported_claims),
                        "claim_count": len(report.claims),
                    },
                )

            return response
        except Exception as error:
            if callback:
                await callback.post(
                    run_id=request.run_id,
                    event_type="diagnosis.failed",
                    status="failed",
                    payload={
                        "project_id": request.project_id,
                        "error": str(error),
                    },
                )
            raise

    def _load_runtime_evidence(self, run_id: str) -> RuntimeEvidence:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT event_id, event_type
                    FROM run_events
                    WHERE run_id = %s
                    ORDER BY sequence ASC, created_at ASC
                    """,
                    (run_id,),
                )
                event_ids: set[str] = set()
                event_ids_by_type: dict[str, list[str]] = {}
                for row in cursor.fetchall():
                    event_id = str(row["event_id"])
                    event_type = str(row["event_type"])
                    event_ids.add(event_id)
                    event_ids_by_type.setdefault(event_type, []).append(event_id)

                cursor.execute(
                    """
                    SELECT id
                    FROM artifacts
                    WHERE run_id = %s
                    """,
                    (run_id,),
                )
                artifact_ids = {str(row["id"]) for row in cursor.fetchall()}

        return RuntimeEvidence(
            event_ids=event_ids,
            event_ids_by_type=event_ids_by_type,
            artifact_ids=artifact_ids,
        )

    def _mock_report(
        self,
        *,
        task_goal: str,
        runtime_evidence: RuntimeEvidence,
        retrieval: RetrievalQueryResponse,
    ) -> DiagnosisReport:
        browser_evidence_ids = self._browser_evidence_ids(runtime_evidence)
        code_evidence_ids = self._code_evidence_ids(retrieval)

        claims = [
            DiagnosisClaim(
                text=(
                    "The empty login submission is missing the expected email required "
                    "validation feedback while password validation is present."
                ),
                evidence_ids=browser_evidence_ids,
            ),
            DiagnosisClaim(
                text=(
                    "The login validation code only checks the password field, so an "
                    "empty email does not produce an email error."
                ),
                evidence_ids=code_evidence_ids,
            ),
        ]

        return DiagnosisReport(
            summary=(
                "The login form validation path is incomplete: password required is "
                "handled, but email required is not validated."
            ),
            severity="medium",
            claims=claims,
            fix_suggestions=[
                FixSuggestion(
                    file_path="src/validation/loginValidation.ts",
                    suggestion=(
                        "Add an email empty-value validation branch that sets the email "
                        "required error before returning validation errors."
                    ),
                )
            ],
            verifier_result=VerifierResult(
                verified=False,
                unsupported_claims=[],
                missing_evidence=[],
            ),
        )

    def _verify(
        self,
        report: DiagnosisReport,
        runtime_evidence: RuntimeEvidence,
        retrieval: RetrievalQueryResponse,
    ) -> VerifierResult:
        valid_evidence_ids = (
            runtime_evidence.event_ids
            | runtime_evidence.artifact_ids
            | {match.chunk_id for match in retrieval.matches}
        )
        unsupported_claims: list[str] = []
        missing_evidence: list[str] = []

        for claim in report.claims:
            if not claim.evidence_ids:
                unsupported_claims.append(claim.text)
                continue

            invalid_ids = [
                evidence_id
                for evidence_id in claim.evidence_ids
                if evidence_id not in valid_evidence_ids
            ]
            if invalid_ids:
                unsupported_claims.append(claim.text)
                missing_evidence.extend(invalid_ids)

        return VerifierResult(
            verified=not unsupported_claims,
            unsupported_claims=unsupported_claims,
            missing_evidence=sorted(set(missing_evidence)),
        )

    def _persist_report(self, run_id: str, report: DiagnosisReport) -> str:
        report_payload = report.model_dump()
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO diagnosis_reports (
                      id,
                      run_id,
                      summary,
                      severity,
                      claims,
                      fix_suggestions,
                      verifier_result
                    )
                    VALUES (
                      gen_random_uuid(), %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb
                    )
                    RETURNING id
                    """,
                    (
                        run_id,
                        report.summary,
                        report.severity,
                        json.dumps(report_payload["claims"]),
                        json.dumps(report_payload["fix_suggestions"]),
                        json.dumps(report_payload["verifier_result"]),
                    ),
                )
                row = cursor.fetchone()
            connection.commit()

        return str(UUID(str(row["id"])))

    def _browser_evidence_ids(self, evidence: RuntimeEvidence) -> list[str]:
        preferred_types = [
            "browser.dom_snapshot",
            "browser.screenshot",
            "browser.network",
            "browser.console",
            "browser.completed",
        ]
        ids: list[str] = []
        for event_type in preferred_types:
            ids.extend(evidence.event_ids_by_type.get(event_type, []))
        if ids:
            return ids[:3]
        return sorted(evidence.event_ids)[:3]

    def _code_evidence_ids(self, retrieval: RetrievalQueryResponse) -> list[str]:
        preferred = [
            match.chunk_id
            for match in retrieval.matches
            if "loginValidation.ts" in match.file_path or "LoginForm.tsx" in match.file_path
        ]
        if preferred:
            return preferred[:2]
        return [match.chunk_id for match in retrieval.matches[:2]]
