"""Router for SQL generation, validation, and dialect conversion."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from services.dialect_converter import SUPPORTED_DIALECTS, convert_dialect
from services.sql_generator import generate_sql
from services.sql_validator import validate_sql

router = APIRouter()


class GenerateSQLRequest(BaseModel):
    intent: dict[str, Any]
    dialect: str = "hive"
    skill_context: str = ""


class ValidateSQLRequest(BaseModel):
    sql: str
    dialect: str = "hive"
    check_schema: bool = True


class ConvertDialectRequest(BaseModel):
    sql: str
    source_dialect: str = "hive"
    target_dialect: str = "maxcompute"


@router.post("/generate-sql")
async def api_generate_sql(body: GenerateSQLRequest):
    """Generate SQL from structured intent using the 5-step pipeline."""
    result = await generate_sql(
        body.intent,
        dialect=body.dialect,
        skill_context=body.skill_context,
    )
    return {"success": True, **result}


@router.post("/validate-sql")
async def api_validate_sql(body: ValidateSQLRequest):
    """Validate SQL syntax, schema consistency, and safety."""
    result = validate_sql(body.sql, dialect=body.dialect, check_schema=body.check_schema)
    return {"success": result["valid"], **result}


@router.post("/convert-dialect")
async def api_convert_dialect(body: ConvertDialectRequest):
    """Convert SQL between dialects using sqlglot.transpile()."""
    return convert_dialect(body.sql, body.source_dialect, body.target_dialect)


@router.get("/supported-dialects")
async def api_supported_dialects():
    """List supported SQL dialects."""
    return {"dialects": SUPPORTED_DIALECTS}
