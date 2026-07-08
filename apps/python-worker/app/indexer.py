import json
from pathlib import Path

import psycopg

from .code_chunker import CodeChunker
from .embeddings import MockEmbeddingProvider
from .events import EventClient
from .schemas import CodeChunk, IndexerRunRequest, IndexerRunResponse


class CodebaseIndexer:
    def __init__(self, database_url: str, embedding_dimension: int = 1536) -> None:
        self.database_url = database_url
        self.chunker = CodeChunker()
        self.embedding_provider = MockEmbeddingProvider(embedding_dimension)
        self.embedding_dimension = embedding_dimension

    async def run(self, request: IndexerRunRequest, workspace_root: Path) -> IndexerRunResponse:
        callback = EventClient(str(request.event_callback_url), agent="indexer")
        target_root = self._resolve_local_path(workspace_root, request.local_path)

        await callback.post(
            run_id=request.run_id,
            event_type="indexer.started",
            status="running",
            payload={
                "project_id": request.project_id,
                "local_path": request.local_path,
            },
        )

        try:
            files = self.chunker.collect_files(target_root)
            chunks: list[CodeChunk] = []

            for source_file in files:
                relative = source_file.relative_to(target_root).as_posix()
                file_chunks = self.chunker.chunk_file(
                    project_id=request.project_id,
                    root=target_root,
                    path=source_file,
                )
                chunks.extend(file_chunks)
                await callback.post(
                    run_id=request.run_id,
                    event_type="indexer.file_scanned",
                    status="running",
                    payload={
                        "file_path": relative,
                        "chunk_count": len(file_chunks),
                    },
                )
                for chunk in file_chunks:
                    await callback.post(
                        run_id=request.run_id,
                        event_type="indexer.chunk_created",
                        status="running",
                        payload={
                            "file_path": chunk.file_path,
                            "chunk_type": chunk.chunk_type,
                            "symbol_name": chunk.symbol_name,
                            "start_line": chunk.start_line,
                            "end_line": chunk.end_line,
                        },
                    )

            rows = []
            for chunk in chunks:
                embedding = self.embedding_provider.embed(chunk.content)
                rows.append((chunk, embedding))
                await callback.post(
                    run_id=request.run_id,
                    event_type="indexer.embedding_created",
                    status="running",
                    payload={
                        "file_path": chunk.file_path,
                        "chunk_type": chunk.chunk_type,
                        "symbol_name": chunk.symbol_name,
                        "dimension": len(embedding),
                        "mock": True,
                    },
                )

            self._replace_chunks(request.project_id, rows)

            await callback.post(
                run_id=request.run_id,
                event_type="indexer.completed",
                status="completed",
                payload={
                    "project_id": request.project_id,
                    "file_count": len(files),
                    "chunk_count": len(chunks),
                    "embedding_dimension": self.embedding_dimension,
                    "mock_embeddings": True,
                },
            )

            return IndexerRunResponse(
                project_id=request.project_id,
                run_id=request.run_id,
                file_count=len(files),
                chunk_count=len(chunks),
                embedding_dimension=self.embedding_dimension,
                mock_embeddings=True,
            )
        except Exception as error:
            await callback.post(
                run_id=request.run_id,
                event_type="indexer.failed",
                status="failed",
                payload={
                    "project_id": request.project_id,
                    "error": str(error),
                },
            )
            raise

    def _replace_chunks(
        self,
        project_id: str,
        rows: list[tuple[CodeChunk, list[float]]],
    ) -> None:
        with psycopg.connect(self.database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM code_chunks WHERE project_id = %s", (project_id,))
                for chunk, embedding in rows:
                    cursor.execute(
                        """
                        INSERT INTO code_chunks (
                          id,
                          project_id,
                          file_path,
                          language,
                          chunk_type,
                          symbol_name,
                          start_line,
                          end_line,
                          content,
                          content_hash,
                          metadata_json,
                          embedding,
                          updated_at
                        )
                        VALUES (
                          gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::vector, now()
                        )
                        """,
                        (
                            chunk.project_id,
                            chunk.file_path,
                            chunk.language,
                            chunk.chunk_type,
                            chunk.symbol_name,
                            chunk.start_line,
                            chunk.end_line,
                            chunk.content,
                            chunk.content_hash,
                            json.dumps(chunk.metadata_json),
                            self._vector_literal(embedding),
                        ),
                    )
            connection.commit()

    def _resolve_local_path(self, workspace_root: Path, local_path: str) -> Path:
        candidate = (workspace_root / local_path).resolve()
        if not candidate.exists() or not candidate.is_dir():
            raise ValueError(f"Local path does not exist: {local_path}")
        if not str(candidate).startswith(str(workspace_root.resolve())):
            raise ValueError("Local path must stay inside the workspace.")
        return candidate

    def _vector_literal(self, values: list[float]) -> str:
        return "[" + ",".join(str(value) for value in values) + "]"
