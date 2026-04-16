"""Text2SQL FastAPI server — core engine for the semantic knowledge platform."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import meta, requirement, sql_generate

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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_env()
    _app.state.config = load_config()
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
