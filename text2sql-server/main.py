"""Text2SQL FastAPI server — core engine for the semantic knowledge platform."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import meta, rag, requirement, sql_generate
from services import rag_service

logger = logging.getLogger(__name__)

_CFG_PATH = Path(__file__).parent / "config.yaml"


def _load_env() -> None:
    """Load .env.local from the project root (same key set used by the Vite frontend)."""
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def load_config() -> dict:
    with open(_CFG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


_MATERIAL_DIR = Path(__file__).resolve().parent.parent / "s1.5 - 副本 (2)"
_MATERIAL_COLLECTION = "ks-005"
_SUPPORTED_EXTS = {".md", ".xlsx", ".txt"}


def _auto_ingest_materials() -> None:
    """Ingest s1.5 materials into ChromaDB collection if it is empty."""
    if not _MATERIAL_DIR.is_dir():
        logger.info("Material directory not found (%s), skipping auto-ingest.", _MATERIAL_DIR)
        return

    try:
        col = rag_service.get_or_create_collection(_MATERIAL_COLLECTION)
        if col.count() > 0:
            logger.info("Collection %s already has %d chunks, skipping auto-ingest.", _MATERIAL_COLLECTION, col.count())
            return
    except Exception as exc:
        logger.warning("Failed to check collection %s: %s", _MATERIAL_COLLECTION, exc)
        return

    files = [f for f in _MATERIAL_DIR.iterdir() if f.is_file() and f.suffix.lower() in _SUPPORTED_EXTS and "副本" not in f.name]
    if not files:
        logger.info("No ingestable files found in %s", _MATERIAL_DIR)
        return

    logger.info("Auto-ingesting %d files into collection %s ...", len(files), _MATERIAL_COLLECTION)
    try:
        result = rag_service.ingest_files(_MATERIAL_COLLECTION, files)
        logger.info("Auto-ingest complete: %d chunks from %d files", result["chunk_count"], result["file_count"])
    except Exception as exc:
        logger.error("Auto-ingest failed: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_env()
    _app.state.config = load_config()
    _auto_ingest_materials()
    yield


app = FastAPI(
    title="Text2SQL Engine",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router, prefix="/api/text2sql", tags=["meta"])
app.include_router(requirement.router, prefix="/api/text2sql", tags=["requirement"])
app.include_router(sql_generate.router, prefix="/api/text2sql", tags=["sql"])
app.include_router(rag.router, prefix="/api/text2sql", tags=["rag"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request, exc: Exception):
    """Always return JSON for unhandled errors to prevent frontend JSON parse failures."""
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal Server Error",
            "detail": str(exc),
        },
    )


@app.get("/api/text2sql/health")
async def health():
    return {"status": "ok"}
