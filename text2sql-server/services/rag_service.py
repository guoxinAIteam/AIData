"""RAG service: ChromaDB for document retrieval.

Provides ingest (chunk + embed + store) and query (semantic search) over
knowledge base collections. Each collection corresponds to a knowledge system.

Embedding strategy:
  - Primary: BAAI/bge-small-zh-v1.5 via sentence-transformers (if model available)
  - Fallback: ChromaDB default ONNX embedding (all-MiniLM-L6-v2, auto-downloaded)
  - Last resort: hash-based deterministic embedding (works fully offline)
"""

from __future__ import annotations

import hashlib
import logging
import struct
from pathlib import Path
from typing import Any

import chromadb

from services.chunker import chunk_file

logger = logging.getLogger(__name__)

_PERSIST_DIR = Path(__file__).resolve().parent.parent / "chroma_data"
_MODEL_NAME = "BAAI/bge-small-zh-v1.5"

_client: chromadb.ClientAPI | None = None
_embed_fn: Any = None
_EMBED_DIM = 384


class _HashEmbeddingFunction(chromadb.EmbeddingFunction):
    """Deterministic hash-based embedding for offline fallback.

    Produces consistent 384-dim vectors from text via SHA-256 expansion.
    Uses n-gram overlap for better keyword matching than pure hash.
    """

    def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
        results: chromadb.Embeddings = []
        for text in input:
            vec = self._text_to_vec(text)
            results.append(vec)
        return results

    @staticmethod
    def _text_to_vec(text: str) -> list[float]:
        vec = [0.0] * _EMBED_DIM
        chars = list(text)
        for i in range(len(chars)):
            for ngram_len in (1, 2, 3):
                if i + ngram_len <= len(chars):
                    gram = "".join(chars[i : i + ngram_len])
                    h = int(hashlib.md5(gram.encode("utf-8")).hexdigest(), 16)
                    idx = h % _EMBED_DIM
                    vec[idx] += 1.0
        norm = sum(f * f for f in vec) ** 0.5 or 1.0
        return [f / norm for f in vec]


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _PERSIST_DIR.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(_PERSIST_DIR))
    return _client


def _check_model_cached() -> bool:
    """Check if bge-small-zh-v1.5 model is already cached locally."""
    cache_dirs = [
        Path.home() / ".cache" / "torch" / "sentence_transformers",
        Path.home() / ".cache" / "huggingface" / "hub",
    ]
    for d in cache_dirs:
        if d.exists() and any(d.rglob("*bge*small*zh*")):
            return True
    return False


def _get_embed_fn() -> Any:
    global _embed_fn
    if _embed_fn is not None:
        return _embed_fn

    if _check_model_cached():
        try:
            from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
            _embed_fn = SentenceTransformerEmbeddingFunction(model_name=_MODEL_NAME)
            logger.info("Using cached SentenceTransformer embedding: %s", _MODEL_NAME)
            return _embed_fn
        except Exception as e:
            logger.warning("SentenceTransformer failed even with cache: %s", e)
    else:
        logger.info("Model %s not cached locally, skipping download to avoid blocking", _MODEL_NAME)

    _embed_fn = _HashEmbeddingFunction()
    logger.info("Using hash-based embedding (works offline, keyword-overlap retrieval)")
    return _embed_fn


def get_or_create_collection(collection_id: str) -> chromadb.Collection:
    client = _get_client()
    return client.get_or_create_collection(
        name=_sanitize_name(collection_id),
        embedding_function=_get_embed_fn(),
    )


def ingest_files(collection_id: str, file_paths: list[str | Path]) -> dict[str, Any]:
    """Chunk files and upsert into ChromaDB collection.

    Returns summary with chunk_count, file_count, files list.
    """
    collection = get_or_create_collection(collection_id)
    all_chunks: list[dict[str, Any]] = []

    for fp in file_paths:
        p = Path(fp)
        if not p.exists():
            logger.warning("File not found, skipping: %s", fp)
            continue
        try:
            chunks = chunk_file(p)
            all_chunks.extend(chunks)
        except Exception as exc:
            logger.error("Failed to chunk %s: %s", fp, exc)

    if not all_chunks:
        return {"chunk_count": 0, "file_count": 0, "files": []}

    batch_size = 100
    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i : i + batch_size]
        collection.upsert(
            ids=[c["id"] for c in batch],
            documents=[c["text"] for c in batch],
            metadatas=[c["metadata"] for c in batch],
        )

    source_files = list({c["metadata"]["source_file"] for c in all_chunks})
    return {
        "chunk_count": len(all_chunks),
        "file_count": len(source_files),
        "files": source_files,
    }


def query(
    collection_id: str,
    query_text: str,
    *,
    top_k: int = 5,
    where: dict | None = None,
) -> list[dict[str, Any]]:
    """Semantic search over a collection. Returns list of {id, text, score, metadata}."""
    try:
        collection = get_or_create_collection(collection_id)
    except Exception:
        return []

    if collection.count() == 0:
        return []

    effective_k = min(top_k, collection.count())
    kwargs: dict[str, Any] = {
        "query_texts": [query_text],
        "n_results": effective_k,
    }
    if where:
        kwargs["where"] = where

    results = collection.query(**kwargs)

    chunks: list[dict[str, Any]] = []
    ids = results.get("ids", [[]])[0]
    docs = results.get("documents", [[]])[0]
    distances = results.get("distances", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]

    for idx in range(len(ids)):
        score = 1.0 - distances[idx] if distances[idx] is not None else 0.0
        chunks.append({
            "id": ids[idx],
            "text": docs[idx] if idx < len(docs) else "",
            "score": round(score, 4),
            "metadata": metadatas[idx] if idx < len(metadatas) else {},
        })
    return chunks


def get_collection_stats(collection_id: str) -> dict[str, Any]:
    """Return stats about a collection."""
    try:
        collection = get_or_create_collection(collection_id)
    except Exception:
        return {"collection_id": collection_id, "chunk_count": 0, "file_count": 0, "file_sources": []}

    count = collection.count()
    file_sources: list[str] = []

    if count > 0:
        sample = collection.peek(limit=min(count, 200))
        seen: set[str] = set()
        for meta in (sample.get("metadatas") or []):
            src = meta.get("source_file", "") if isinstance(meta, dict) else ""
            if src and src not in seen:
                seen.add(src)
                file_sources.append(src)

    return {
        "collection_id": collection_id,
        "chunk_count": count,
        "file_count": len(file_sources),
        "file_sources": file_sources,
    }


def list_chunks(collection_id: str, *, limit: int = 200, offset: int = 0) -> list[dict[str, Any]]:
    """List chunks in a collection for browsing."""
    try:
        collection = get_or_create_collection(collection_id)
    except Exception:
        return []

    count = collection.count()
    if count == 0:
        return []

    result = collection.get(
        limit=min(limit, count),
        offset=min(offset, max(0, count - 1)),
        include=["documents", "metadatas"],
    )

    chunks: list[dict[str, Any]] = []
    ids = result.get("ids", [])
    docs = result.get("documents", [])
    metadatas = result.get("metadatas", [])

    for i in range(len(ids)):
        chunks.append({
            "id": ids[i],
            "text": docs[i] if i < len(docs) else "",
            "metadata": metadatas[i] if i < len(metadatas) else {},
        })
    return chunks


def delete_collection(collection_id: str) -> bool:
    """Delete a collection entirely."""
    client = _get_client()
    try:
        client.delete_collection(name=_sanitize_name(collection_id))
        return True
    except Exception:
        return False


def _sanitize_name(name: str) -> str:
    """ChromaDB collection names must be 3-63 chars, alphanumeric + dash/underscore."""
    sanitized = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    if len(sanitized) < 3:
        sanitized = sanitized + "_col"
    return sanitized[:63]
