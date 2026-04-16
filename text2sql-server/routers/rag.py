"""RAG router: ingest, query, stats, delete, ingest-folder endpoints."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import rag_service

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class IngestRequest(BaseModel):
    collection_id: str
    file_paths: list[str]


class IngestFolderRequest(BaseModel):
    collection_id: str
    folder_path: str
    extensions: list[str] = Field(default=[".md", ".xlsx", ".txt"])


class QueryRequest(BaseModel):
    collection_id: str
    query_text: str
    top_k: int = 5


class ListChunksRequest(BaseModel):
    collection_id: str
    limit: int = 200
    offset: int = 0


@router.post("/rag/ingest")
async def ingest_files(req: IngestRequest) -> dict[str, Any]:
    """Chunk and ingest files into a ChromaDB collection."""
    resolved: list[Path] = []
    for fp in req.file_paths:
        p = Path(fp)
        if not p.is_absolute():
            p = PROJECT_ROOT / p
        if not p.exists():
            raise HTTPException(status_code=400, detail=f"File not found: {fp}")
        resolved.append(p)

    result = rag_service.ingest_files(req.collection_id, resolved)
    return {"success": True, **result}


@router.post("/rag/ingest-folder")
async def ingest_folder(req: IngestFolderRequest) -> dict[str, Any]:
    """Batch-import all matching files from a folder."""
    folder = Path(req.folder_path)
    if not folder.is_absolute():
        folder = PROJECT_ROOT / folder
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Directory not found: {req.folder_path}")

    file_paths: list[Path] = []
    for ext in req.extensions:
        file_paths.extend(folder.glob(f"*{ext}"))

    if not file_paths:
        return {"success": True, "chunk_count": 0, "file_count": 0, "files": [], "message": "No matching files found"}

    result = rag_service.ingest_files(req.collection_id, file_paths)
    return {"success": True, **result}


@router.post("/rag/query")
async def query_chunks(req: QueryRequest) -> dict[str, Any]:
    """Semantic search over a collection."""
    chunks = rag_service.query(req.collection_id, req.query_text, top_k=req.top_k)
    return {"success": True, "chunks": chunks, "count": len(chunks)}


@router.get("/rag/stats/{collection_id}")
async def collection_stats(collection_id: str) -> dict[str, Any]:
    """Get statistics for a collection."""
    stats = rag_service.get_collection_stats(collection_id)
    return {"success": True, **stats}


@router.post("/rag/list-chunks")
async def list_chunks_endpoint(req: ListChunksRequest) -> dict[str, Any]:
    """List chunks in a collection for browsing."""
    chunks = rag_service.list_chunks(req.collection_id, limit=req.limit, offset=req.offset)
    stats = rag_service.get_collection_stats(req.collection_id)
    return {
        "success": True,
        "chunks": chunks,
        "total": stats["chunk_count"],
    }


@router.delete("/rag/collection/{collection_id}")
async def delete_collection(collection_id: str) -> dict[str, Any]:
    """Delete an entire collection."""
    ok = rag_service.delete_collection(collection_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Collection not found or already deleted")
    return {"success": True, "message": f"Collection '{collection_id}' deleted"}
