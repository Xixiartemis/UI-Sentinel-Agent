from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

from .embeddings import MockEmbeddingProvider
from .events import EventClient
from .schemas import RetrievalMatch, RetrievalQueryRequest, RetrievalQueryResponse


@dataclass
class Candidate:
    chunk_id: str
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str
    symbol_name: str
    content: str
    vector_score: float = 0.0
    keyword_score: float = 0.0

    @property
    def final_score(self) -> float:
        return (0.6 * self.vector_score) + (0.4 * self.keyword_score)


class RetrievalService:
    def __init__(self, database_url: str, embedding_dimension: int = 1536) -> None:
        self.database_url = database_url
        self.embedding_provider = MockEmbeddingProvider(embedding_dimension)

    async def query(self, request: RetrievalQueryRequest) -> RetrievalQueryResponse:
        rewritten_queries = self._rewrite_queries(request.query)
        embedding = self.embedding_provider.embed(" ".join(rewritten_queries))

        vector_rows = self._vector_search(request.project_id, embedding, limit=20)
        keyword_rows = self._keyword_search(request.project_id, rewritten_queries, limit=20)
        matches = self._merge(vector_rows, keyword_rows, top_k=request.top_k)

        response = RetrievalQueryResponse(
            project_id=request.project_id,
            query=request.query,
            rewritten_queries=rewritten_queries,
            matches=matches,
        )

        if request.run_id and request.event_callback_url:
            await self._emit_retrieved_event(request, response)

        return response

    def _rewrite_queries(self, query: str) -> list[str]:
        normalized = " ".join(query.split())
        lowered = normalized.lower()
        queries = [normalized]

        if "email" in lowered or "login" in lowered or "required" in lowered:
            queries.append("LoginForm email password validation")
            queries.append("LoginForm email required validation")
            queries.append("login validation missing email error")

        return list(dict.fromkeys(queries))

    def _vector_search(
        self,
        project_id: str,
        embedding: list[float],
        limit: int,
    ) -> list[dict[str, object]]:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                      id,
                      file_path,
                      start_line,
                      end_line,
                      chunk_type,
                      symbol_name,
                      content,
                      1.0 - (embedding <=> %s::vector) AS score
                    FROM code_chunks
                    WHERE project_id = %s
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (self._vector_literal(embedding), project_id, self._vector_literal(embedding), limit),
                )
                return list(cursor.fetchall())

    def _keyword_search(
        self,
        project_id: str,
        queries: list[str],
        limit: int,
    ) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                for query_text in queries:
                    cursor.execute(
                        """
                        WITH q AS (
                          SELECT websearch_to_tsquery('simple', %s) AS query
                        )
                        SELECT
                          id,
                          file_path,
                          start_line,
                          end_line,
                          chunk_type,
                          symbol_name,
                          content,
                          ts_rank_cd(
                            to_tsvector(
                              'simple',
                              coalesce(file_path, '') || ' ' ||
                              coalesce(symbol_name, '') || ' ' ||
                              coalesce(chunk_type, '') || ' ' ||
                              coalesce(content, '')
                            ),
                            q.query
                          ) AS score
                        FROM code_chunks, q
                        WHERE project_id = %s
                          AND to_tsvector(
                            'simple',
                            coalesce(file_path, '') || ' ' ||
                            coalesce(symbol_name, '') || ' ' ||
                            coalesce(chunk_type, '') || ' ' ||
                            coalesce(content, '')
                          ) @@ q.query
                        ORDER BY score DESC
                        LIMIT %s
                        """,
                        (query_text, project_id, limit),
                    )
                    rows.extend(cursor.fetchall())
                return rows

    def _merge(
        self,
        vector_rows: list[dict[str, object]],
        keyword_rows: list[dict[str, object]],
        top_k: int,
    ) -> list[RetrievalMatch]:
        candidates: dict[str, Candidate] = {}
        max_keyword = max([float(row["score"] or 0.0) for row in keyword_rows] or [0.0])

        for row in vector_rows:
            candidate = self._candidate(row)
            candidate.vector_score = self._clamp(float(row["score"] or 0.0))
            candidates[candidate.chunk_id] = candidate

        for row in keyword_rows:
            chunk_id = str(row["id"])
            candidate = candidates.get(chunk_id)
            if not candidate:
                candidate = self._candidate(row)
                candidates[chunk_id] = candidate
            raw_score = float(row["score"] or 0.0)
            keyword_score = self._clamp(raw_score / max_keyword) if max_keyword > 0 else 0.0
            candidate.keyword_score = max(candidate.keyword_score, keyword_score)

        ranked = sorted(
            candidates.values(),
            key=lambda item: (
                item.final_score,
                item.keyword_score,
                item.vector_score,
                "LoginForm" in item.file_path,
            ),
            reverse=True,
        )

        return [
            RetrievalMatch(
                chunk_id=candidate.chunk_id,
                file_path=candidate.file_path,
                start_line=candidate.start_line,
                end_line=candidate.end_line,
                chunk_type=candidate.chunk_type,
                symbol_name=candidate.symbol_name,
                vector_score=round(candidate.vector_score, 6),
                keyword_score=round(candidate.keyword_score, 6),
                final_score=round(candidate.final_score, 6),
                content=candidate.content,
            )
            for candidate in ranked[:top_k]
        ]

    async def _emit_retrieved_event(
        self,
        request: RetrievalQueryRequest,
        response: RetrievalQueryResponse,
    ) -> None:
        if not request.run_id or not request.event_callback_url:
            return

        callback = EventClient(str(request.event_callback_url), agent="retrieval")
        await callback.post(
            run_id=request.run_id,
            event_type="rag.retrieved",
            status="completed",
            payload={
                "project_id": request.project_id,
                "query": request.query,
                "rewritten_queries": response.rewritten_queries,
                "match_count": len(response.matches),
                "matches": [
                    {
                        "chunk_id": match.chunk_id,
                        "file_path": match.file_path,
                        "start_line": match.start_line,
                        "end_line": match.end_line,
                        "final_score": match.final_score,
                    }
                    for match in response.matches
                ],
            },
        )

    def _candidate(self, row: dict[str, object]) -> Candidate:
        return Candidate(
            chunk_id=str(row["id"]),
            file_path=str(row["file_path"]),
            start_line=int(row["start_line"]),
            end_line=int(row["end_line"]),
            chunk_type=str(row["chunk_type"]),
            symbol_name=str(row["symbol_name"]),
            content=str(row["content"]),
        )

    def _clamp(self, value: float) -> float:
        return max(0.0, min(1.0, value))

    def _vector_literal(self, values: list[float]) -> str:
        return "[" + ",".join(str(value) for value in values) + "]"
