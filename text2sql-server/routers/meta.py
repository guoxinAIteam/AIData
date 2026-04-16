"""Router for metadata extraction and management."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

from services.meta_extractor import extract_and_save, list_meta_files, load_meta_file

router = APIRouter()


class ExtractMetaRequest(BaseModel):
    ddl_text: str | None = None
    sample_sql_text: str | None = None
    requirement_text: str | None = None
    code_table_text: str | None = None


class SyncFromExcelRequest(BaseModel):
    """Receive a KnowledgePack-like JSON from the TS side and convert to meta/ files."""
    requirement_text: str | None = None
    lexicon: list[dict] | None = None
    data_dictionary: list[dict] | None = None
    table_relations: list[dict] | None = None
    sql_templates: list[dict] | None = None
    output_spec: list[dict] | None = None


@router.post("/extract-meta")
async def extract_meta(body: ExtractMetaRequest):
    """Run the full extraction pipeline from raw text inputs."""
    saved = await extract_and_save(
        ddl_text=body.ddl_text,
        sample_sql_text=body.sample_sql_text,
        requirement_text=body.requirement_text,
        code_table_text=body.code_table_text,
    )
    return {"success": True, "files_updated": list(saved.keys())}


@router.post("/extract-meta/upload")
async def extract_meta_upload(
    file: UploadFile = File(...),
    file_type: str = Form("auto"),
):
    """Upload a file (DDL, SQL, MD, etc.) and extract metadata from it."""
    content = (await file.read()).decode("utf-8", errors="replace")
    filename = file.filename or ""

    if file_type == "auto":
        lower = filename.lower()
        if lower.endswith(".sql") or "ddl" in lower:
            file_type = "ddl"
        elif lower.endswith(".md"):
            file_type = "requirement"
        else:
            file_type = "requirement"

    kwargs: dict[str, str] = {}
    if file_type == "ddl":
        kwargs["ddl_text"] = content
    elif file_type == "sql":
        kwargs["sample_sql_text"] = content
    elif file_type == "requirement":
        kwargs["requirement_text"] = content
    elif file_type == "code_table":
        kwargs["code_table_text"] = content

    saved = await extract_and_save(**kwargs)
    return {"success": True, "detected_type": file_type, "files_updated": list(saved.keys())}


@router.post("/sync-from-excel")
async def sync_from_excel(body: SyncFromExcelRequest):
    """Sync KnowledgePack data (from the TS Excel engine) into meta/ format."""
    ddl_lines: list[str] = []
    if body.data_dictionary:
        for table in body.data_dictionary:
            tbl_name = table.get("tableName", "unknown_table")
            ddl_lines.append(f"CREATE TABLE {tbl_name} (")
            fields = table.get("fields", [])
            col_defs = []
            for f in fields:
                col_name = f.get("fieldName", f.get("name", "col"))
                col_type = f.get("fieldType", f.get("type", "STRING"))
                comment = f.get("description", f.get("comment", ""))
                col_defs.append(f"  {col_name} {col_type} COMMENT '{comment}'")
            ddl_lines.append(",\n".join(col_defs))
            ddl_lines.append(");\n")

    sql_text = ""
    if body.sql_templates:
        sql_text = "\n\n".join(t.get("rawSql", "") for t in body.sql_templates if t.get("rawSql"))

    saved = await extract_and_save(
        ddl_text="\n".join(ddl_lines) if ddl_lines else None,
        sample_sql_text=sql_text or None,
        requirement_text=body.requirement_text,
    )
    return {"success": True, "files_updated": list(saved.keys())}


@router.get("/meta-status")
async def meta_status():
    """Check which meta files exist."""
    return {"files": list_meta_files()}


@router.get("/meta/{filename}")
async def get_meta_file(filename: str):
    """Read a specific meta file."""
    content = load_meta_file(filename)
    if content is None:
        return {"success": False, "error": f"{filename} not found"}
    return {"success": True, "filename": filename, "content": content}
