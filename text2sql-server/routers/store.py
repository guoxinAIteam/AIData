"""Key-value JSON file store — replaces browser localStorage for persistence."""

from __future__ import annotations

import json
import tempfile
import threading
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter()

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_ALLOWED_KEYS = {"domain_data", "auth_users", "auth_session"}
_lock = threading.Lock()


def _ensure_data_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _file_for(key: str) -> Path:
    return _DATA_DIR / f"{key}.json"


@router.get("/store/{key}")
async def get_store(key: str) -> dict[str, Any]:
    if key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid key: {key}")
    _ensure_data_dir()
    fp = _file_for(key)
    if not fp.exists():
        return {"data": None}
    try:
        raw = fp.read_text(encoding="utf-8")
        return {"data": json.loads(raw)}
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Read error: {exc}") from exc


@router.put("/store/{key}")
async def put_store(key: str, request: Request) -> dict[str, Any]:
    if key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid key: {key}")
    _ensure_data_dir()
    body = await request.body()
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    fp = _file_for(key)
    with _lock:
        fd, tmp_path = tempfile.mkstemp(dir=str(_DATA_DIR), suffix=".tmp")
        try:
            with open(fd, "w", encoding="utf-8") as f:
                json.dump(parsed, f, ensure_ascii=False)
            Path(tmp_path).replace(fp)
        except Exception:
            Path(tmp_path).unlink(missing_ok=True)
            raise

    return {"success": True, "key": key}


@router.delete("/store/{key}")
async def delete_store(key: str) -> dict[str, Any]:
    if key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid key: {key}")
    fp = _file_for(key)
    if fp.exists():
        fp.unlink()
    return {"success": True, "key": key}
