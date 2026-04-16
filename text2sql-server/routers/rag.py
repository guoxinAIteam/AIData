"""Router for RAG ingestion/query APIs."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.rag_service import rag_service

router = APIRouter()


class IngestRequest(BaseModel):
    collection_id: str
    file_paths: list[str]


class IngestFolderRequest(BaseModel):
    collection_id: str
    folder_path: str
    patterns: list[str] = Field(default_factory=lambda: ["*.md", "*.txt", "*.xlsx", "*.xlsm"])


class QueryRequest(BaseModel):
    collection_id: str
    query_text: str
    top_k: int = 5


@router.post("/rag/ingest")
async def rag_ingest(body: IngestRequest):
    result = await rag_service.ingest_files(body.collection_id, body.file_paths)
    return {"success": True, **result}


@router.post("/rag/ingest-folder")
async def rag_ingest_folder(body: IngestFolderRequest):
    result = await rag_service.ingest_folder(
        body.collection_id,
        body.folder_path,
        patterns=tuple(body.patterns),
    )
    return {"success": True, **result}


@router.post("/rag/query")
async def rag_query(body: QueryRequest):
    items = await rag_service.query(body.collection_id, body.query_text, top_k=body.top_k)
    return {"success": True, "items": items, "count": len(items)}


@router.get("/rag/stats/{collection_id}")
async def rag_stats(collection_id: str):
    stats: dict[str, Any] = rag_service.get_collection_stats(collection_id)
    return {"success": True, **stats}


@router.delete("/rag/collection/{collection_id}")
async def rag_delete_collection(collection_id: str):
    rag_service.delete_collection(collection_id)
    return {"success": True, "collection_id": collection_id}
