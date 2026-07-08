import hashlib
import re
from pathlib import Path

from .schemas import CodeChunk


EXCLUDED_PARTS = {
    "node_modules",
    "dist",
    "build",
    ".git",
    "coverage",
}

SOURCE_EXTENSIONS = {".ts", ".tsx"}


class CodeChunker:
    def collect_files(self, root: Path) -> list[Path]:
        src_root = root / "src"
        if not src_root.exists():
            return []

        files: list[Path] = []
        for path in src_root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_EXTENSIONS:
                continue
            if self._is_excluded(path):
                continue
            if path.name == ".env" or path.name.startswith(".env."):
                continue
            files.append(path)

        return sorted(files)

    def chunk_file(self, project_id: str, root: Path, path: Path) -> list[CodeChunk]:
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        relative_path = path.relative_to(root).as_posix()
        chunks = [
            self._chunk(
                project_id=project_id,
                file_path=relative_path,
                chunk_type=self._file_chunk_type(relative_path, text),
                symbol_name=Path(relative_path).stem,
                start_line=1,
                end_line=max(len(lines), 1),
                content=text,
                metadata_json={"source": "file"},
            )
        ]

        chunks.extend(self._symbol_chunks(project_id, relative_path, lines))
        return chunks

    def _symbol_chunks(
        self,
        project_id: str,
        file_path: str,
        lines: list[str],
    ) -> list[CodeChunk]:
        chunks: list[CodeChunk] = []
        patterns = [
            re.compile(r"export\s+function\s+(use[A-Z][A-Za-z0-9_]*)\s*\("),
            re.compile(r"export\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\("),
            re.compile(r"export\s+function\s+([a-zA-Z_][A-Za-z0-9_]*)\s*\("),
            re.compile(r"export\s+async\s+function\s+([a-zA-Z_][A-Za-z0-9_]*)\s*\("),
            re.compile(r"const\s+([A-Z][A-Za-z0-9_]*)\s*="),
        ]

        for index, line in enumerate(lines):
            for pattern in patterns:
                match = pattern.search(line)
                if not match:
                    continue
                symbol = match.group(1)
                start_line, end_line = self._symbol_range(lines, index)
                content = "\n".join(lines[start_line - 1 : end_line])
                chunks.append(
                    self._chunk(
                        project_id=project_id,
                        file_path=file_path,
                        chunk_type=self._symbol_type(file_path, symbol, content),
                        symbol_name=symbol,
                        start_line=start_line,
                        end_line=end_line,
                        content=content,
                        metadata_json={"source": "symbol"},
                    )
                )
                break

        extra = self._validation_or_api_chunk(project_id, file_path, lines)
        if extra:
            chunks.append(extra)

        return chunks

    def _validation_or_api_chunk(
        self,
        project_id: str,
        file_path: str,
        lines: list[str],
    ) -> CodeChunk | None:
        text = "\n".join(lines)
        lowered = file_path.lower() + "\n" + text.lower()
        if "validation" not in lowered and "fetch(" not in text and "/api/" not in text:
            return None

        chunk_type = "validation" if "validation" in lowered or "required" in lowered else "api_module"
        return self._chunk(
            project_id=project_id,
            file_path=file_path,
            chunk_type=chunk_type,
            symbol_name=f"{Path(file_path).stem}:{chunk_type}",
            start_line=1,
            end_line=max(len(lines), 1),
            content=text,
            metadata_json={"source": "heuristic"},
        )

    def _file_chunk_type(self, file_path: str, text: str) -> str:
        lowered = file_path.lower() + "\n" + text.lower()
        if "validation" in lowered:
            return "validation"
        if "api/" in file_path or "fetch(" in text:
            return "api_module"
        if "main.tsx" in file_path or "page" in lowered or "route" in lowered:
            return "route_or_page"
        return "file"

    def _symbol_type(self, file_path: str, symbol: str, content: str) -> str:
        if symbol.startswith("use"):
            return "hook"
        if "validation" in file_path.lower() or "required" in content.lower():
            return "validation"
        if "api/" in file_path or "fetch(" in content:
            return "api_module"
        if symbol[:1].isupper():
            return "component"
        return "function"

    def _symbol_range(self, lines: list[str], start_index: int) -> tuple[int, int]:
        brace_depth = 0
        seen_open = False
        for index in range(start_index, len(lines)):
            line = lines[index]
            brace_depth += line.count("{")
            if "{" in line:
                seen_open = True
            brace_depth -= line.count("}")
            if seen_open and brace_depth <= 0:
                return start_index + 1, index + 1

        return start_index + 1, min(len(lines), start_index + 40)

    def _chunk(
        self,
        *,
        project_id: str,
        file_path: str,
        chunk_type: str,
        symbol_name: str,
        start_line: int,
        end_line: int,
        content: str,
        metadata_json: dict[str, object],
    ) -> CodeChunk:
        return CodeChunk(
            project_id=project_id,
            file_path=file_path,
            chunk_type=chunk_type,
            symbol_name=symbol_name,
            start_line=start_line,
            end_line=end_line,
            content=content,
            content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            metadata_json=metadata_json,
        )

    def _is_excluded(self, path: Path) -> bool:
        return any(part in EXCLUDED_PARTS for part in path.parts)
