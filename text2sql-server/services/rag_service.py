"""RAG service based on ChromaDB + sentence-transformers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

from services.chunker import Chunk, chunk_file


RAG_PERSIST_DIR = Path(__file__).resolve().parent.parent / "chroma_data"
RAG_MODEL = "BAAI/bge-small-zh-v1.5"


class RAGService:
    def __init__(self, persist_dir: Path | str = RAG_PERSIST_DIR, model_name: str = RAG_MODEL):
        self.persist_dir = Path(persist_dir)
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(path=str(self.persist_dir))
        self.model_name = model_name
        self._embed_fn: SentenceTransformerEmbeddingFunction | None = None

    @property
    def embed_fn(self) -> SentenceTransformerEmbeddingFunction:
        # Lazy init avoids blocking FastAPI startup on first import.
        if self._embed_fn is None:
            self._embed_fn = SentenceTransformerEmbeddingFunction(model_name=self.model_name)
        return self._embed_fn

    def get_or_create_collection(self, collection_id: str):
        return self.client.get_or_create_collection(
            name=collection_id,
            embedding_function=self.embed_fn,
            metadata={"hnsw:space": "cosine"},
        )

    async def ingest_files(self, collection_id: str, file_paths: list[str]) -> dict[str, Any]:
        collection = self.get_or_create_collection(collection_id)
        chunk_count = 0
        source_files: list[str] = []

        for file_path in file_paths:
            chunks = chunk_file(file_path)
            if not chunks:
                continue
            source_files.append(Path(file_path).name)
            self._upsert_chunks(collection, chunks)
            chunk_count += len(chunks)

        stats = self.get_collection_stats(collection_id)
        return {
            "collection_id": collection_id,
            "ingested_files": source_files,
            "ingested_chunk_count": chunk_count,
            "total_chunk_count": stats["chunk_count"],
            "file_count": stats["file_count"],
        }

    async def ingest_folder(
        self,
        collection_id: str,
        folder_path: str,
        patterns: tuple[str, ...] = ("*.md", "*.txt", "*.xlsx", "*.xlsm"),
    ) -> dict[str, Any]:
        root = Path(folder_path)
        if not root.exists() or not root.is_dir():
            raise ValueError(f"folder not found: {folder_path}")
        files: list[str] = []
        for pattern in patterns:
            files.extend(str(p) for p in sorted(root.glob(pattern)))
        return await self.ingest_files(collection_id, sorted(set(files)))

    async def query(self, collection_id: str, query_text: str, top_k: int = 5) -> list[dict[str, Any]]:
        collection = self.get_or_create_collection(collection_id)
        if collection.count() == 0:
            return []
        top_k = max(1, min(top_k, 20))
        res = collection.query(
            query_texts=[query_text],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )
        documents = (res.get("documents") or [[]])[0]
        metadatas = (res.get("metadatas") or [[]])[0]
        distances = (res.get("distances") or [[]])[0]

        items: list[dict[str, Any]] = []
        for idx, doc in enumerate(documents):
            if not doc:
                continue
            meta = metadatas[idx] if idx < len(metadatas) else {}
            distance = distances[idx] if idx < len(distances) else None
            score = None if distance is None else round(1 - float(distance), 6)
            items.append(
                {
                    "id": (res.get("ids") or [[]])[0][idx] if res.get("ids") else "",
                    "text": doc,
                    "score": score,
                    "metadata": meta or {},
                }
            )
        return items

    def get_collection_stats(self, collection_id: str) -> dict[str, Any]:
        collection = self.get_or_create_collection(collection_id)
        total = collection.count()
        file_sources: set[str] = set()
        if total > 0:
            records = collection.get(include=["metadatas"])
            for meta in records.get("metadatas") or []:
                source = (meta or {}).get("source_file")
                if source:
                    file_sources.add(str(source))
        return {
            "collection_id": collection_id,
            "chunk_count": total,
            "file_count": len(file_sources),
            "file_sources": sorted(file_sources),
        }

    def delete_collection(self, collection_id: str) -> None:
        self.client.delete_collection(name=collection_id)

    @staticmethod
    def _upsert_chunks(collection: Any, chunks: list[Chunk]) -> None:
        collection.upsert(
            ids=[c.id for c in chunks],
            documents=[c.text for c in chunks],
            metadatas=[c.metadata for c in chunks],
        )


rag_service = RAGService()
