"""Document chunking utilities for RAG ingestion."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import re
from typing import Any

from openpyxl import load_workbook


MAX_CHUNK_CHARS = 500
OVERLAP_CHARS = 50


@dataclass
class Chunk:
    """Normalized chunk for vector ingestion."""

    id: str
    text: str
    metadata: dict[str, Any]


def chunk_file(path: str | Path) -> list[Chunk]:
    """Chunk a file by extension."""
    p = Path(path)
    suffix = p.suffix.lower()
    if suffix == ".md":
        return _chunk_markdown(p)
    if suffix in {".txt"}:
        return _chunk_text(p)
    if suffix in {".xlsx", ".xlsm"}:
        return _chunk_excel(p)
    raise ValueError(f"unsupported file type: {p.name}")


def _stable_chunk_id(source_file: str, index: int, text: str) -> str:
    digest = hashlib.sha1(f"{source_file}:{index}:{text}".encode("utf-8")).hexdigest()[:16]
    return f"chk-{digest}"


def _sliding_windows(text: str, *, max_chars: int = MAX_CHUNK_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    t = re.sub(r"\s+", " ", text).strip()
    if not t:
        return []
    if len(t) <= max_chars:
        return [t]
    windows: list[str] = []
    start = 0
    step = max(1, max_chars - overlap)
    while start < len(t):
        part = t[start : start + max_chars].strip()
        if part:
            windows.append(part)
        if start + max_chars >= len(t):
            break
        start += step
    return windows


def _chunk_markdown(path: Path) -> list[Chunk]:
    content = path.read_text(encoding="utf-8", errors="replace")
    lines = content.splitlines()
    sections: list[tuple[str, list[str]]] = []
    current_title = "文档概述"
    buffer: list[str] = []
    for line in lines:
        if re.match(r"^\s*#{1,6}\s+", line):
            if buffer:
                sections.append((current_title, buffer))
            current_title = re.sub(r"^\s*#{1,6}\s+", "", line).strip() or "未命名章节"
            buffer = []
            continue
        buffer.append(line)
    if buffer:
        sections.append((current_title, buffer))

    chunks: list[Chunk] = []
    idx = 0
    for title, body_lines in sections:
        body = "\n".join(body_lines).strip()
        for part in _sliding_windows(body):
            idx += 1
            chunks.append(
                Chunk(
                    id=_stable_chunk_id(path.name, idx, part),
                    text=part,
                    metadata={
                        "source_file": path.name,
                        "chunk_type": "markdown_section",
                        "section_title": title,
                        "chunk_index": idx,
                    },
                )
            )
    return chunks


def _chunk_text(path: Path) -> list[Chunk]:
    content = path.read_text(encoding="utf-8", errors="replace")
    parts = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
    chunks: list[Chunk] = []
    idx = 0
    for para in parts:
        for part in _sliding_windows(para):
            idx += 1
            chunks.append(
                Chunk(
                    id=_stable_chunk_id(path.name, idx, part),
                    text=part,
                    metadata={
                        "source_file": path.name,
                        "chunk_type": "text_paragraph",
                        "chunk_index": idx,
                    },
                )
            )
    return chunks


def _chunk_excel(path: Path) -> list[Chunk]:
    wb = load_workbook(path, read_only=True, data_only=True)
    chunks: list[Chunk] = []
    idx = 0
    try:
        for ws in wb.worksheets:
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                continue
            headers = [str(c).strip() if c is not None else "" for c in rows[0]]
            for row_no, row in enumerate(rows[1:], start=2):
                cells: list[str] = []
                for i, val in enumerate(row):
                    v = "" if val is None else str(val).strip()
                    if not v:
                        continue
                    key = headers[i] if i < len(headers) and headers[i] else f"col_{i+1}"
                    cells.append(f"{key}: {v}")
                if not cells:
                    continue
                text = "；".join(cells)
                for part in _sliding_windows(text):
                    idx += 1
                    chunks.append(
                        Chunk(
                            id=_stable_chunk_id(path.name, idx, part),
                            text=part,
                            metadata={
                                "source_file": path.name,
                                "chunk_type": "excel_row",
                                "sheet_name": ws.title,
                                "row_number": row_no,
                                "chunk_index": idx,
                            },
                        )
                    )
    finally:
        wb.close()
    return chunks
