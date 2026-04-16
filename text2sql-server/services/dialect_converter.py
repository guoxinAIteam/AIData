"""SQL dialect converter using sqlglot.transpile()."""

from __future__ import annotations

from typing import Any

import sqlglot

SUPPORTED_DIALECTS = ["hive", "maxcompute", "spark", "mysql", "postgres"]

_DIALECT_MAP = {
    "maxcompute": "hive",
    "sparksql": "spark",
    "postgresql": "postgres",
    "pg": "postgres",
}


def _normalize_dialect(name: str) -> str:
    lower = name.lower().strip()
    return _DIALECT_MAP.get(lower, lower)


def convert_dialect(
    sql: str,
    source_dialect: str = "hive",
    target_dialect: str = "maxcompute",
    pretty: bool = True,
) -> dict[str, Any]:
    """Convert SQL from one dialect to another.

    Returns:
        {
            "success": bool,
            "sql": str,
            "source_dialect": str,
            "target_dialect": str,
            "error": str | None,
        }
    """
    src = _normalize_dialect(source_dialect)
    tgt = _normalize_dialect(target_dialect)

    try:
        results = sqlglot.transpile(sql, read=src, write=tgt, pretty=pretty)
        converted = "\n\n".join(results)
        return {
            "success": True,
            "sql": converted,
            "source_dialect": src,
            "target_dialect": tgt,
            "error": None,
        }
    except Exception as e:
        return {
            "success": False,
            "sql": sql,
            "source_dialect": src,
            "target_dialect": tgt,
            "error": str(e),
        }
