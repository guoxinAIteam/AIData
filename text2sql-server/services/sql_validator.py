"""SQL validator: syntax + schema consistency + dialect compatibility checks."""

from __future__ import annotations

import re
from typing import Any

import sqlglot
from sqlglot import exp

from services.meta_extractor import load_meta_file


def _extract_tables_from_schema_md() -> set[str]:
    """Extract known table names from schema.md."""
    content = load_meta_file("schema.md")
    if not content:
        return set()
    tables: set[str] = set()
    for match in re.finditer(r"^##\s+(?:\w+\.)?(\w+)", content, re.MULTILINE):
        tables.add(match.group(1).upper())
    return tables


def _extract_columns_from_schema_md() -> dict[str, set[str]]:
    """Extract table -> column sets from schema.md."""
    content = load_meta_file("schema.md")
    if not content:
        return {}
    result: dict[str, set[str]] = {}
    current_table = ""
    for line in content.splitlines():
        header_match = re.match(r"^##\s+(?:\w+\.)?(\w+)", line)
        if header_match:
            current_table = header_match.group(1).upper()
            result[current_table] = set()
            continue
        if current_table and line.startswith("|") and not line.startswith("|--") and "字段名" not in line:
            cells = [c.strip() for c in line.split("|")]
            if len(cells) >= 2 and cells[1]:
                result[current_table].add(cells[1].upper())
    return result


def validate_sql(
    sql: str,
    dialect: str = "hive",
    check_schema: bool = True,
) -> dict[str, Any]:
    """Validate SQL with syntax, schema consistency, and safety checks.

    Returns:
        {
            "valid": bool,
            "errors": list[str],
            "warnings": list[str],
            "tables_used": list[str],
            "columns_used": list[str],
            "unknown_tables": list[str],
            "unknown_columns": list[str],
        }
    """
    errors: list[str] = []
    warnings: list[str] = []
    tables_used: list[str] = []
    columns_used: list[str] = []
    unknown_tables: list[str] = []
    unknown_columns: list[str] = []

    upper_sql = sql.strip().upper()
    forbidden = ["DROP", "TRUNCATE", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE"]
    for kw in forbidden:
        if re.search(rf"\b{kw}\b", upper_sql):
            errors.append(f"包含危险操作: {kw}")

    if not upper_sql.startswith("SELECT"):
        warnings.append("非 SELECT 语句")

    try:
        parsed = sqlglot.parse(sql, read=dialect, error_level=sqlglot.ErrorLevel.RAISE)
        if not parsed or all(s is None for s in parsed):
            errors.append("SQL 解析结果为空")
    except sqlglot.errors.ParseError as e:
        errors.append(f"语法错误: {e}")
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "tables_used": [],
            "columns_used": [],
            "unknown_tables": [],
            "unknown_columns": [],
        }

    for stmt in parsed:
        if stmt is None:
            continue
        for table_node in stmt.find_all(exp.Table):
            name = table_node.name.upper()
            if name and name not in tables_used:
                tables_used.append(name)
        for col_node in stmt.find_all(exp.Column):
            name = col_node.name.upper()
            if name and name not in columns_used:
                columns_used.append(name)

    if check_schema:
        known_tables = _extract_tables_from_schema_md()
        known_columns = _extract_columns_from_schema_md()

        if known_tables:
            for t in tables_used:
                base_name = t.split(".")[-1] if "." in t else t
                if base_name not in known_tables:
                    unknown_tables.append(t)
            if unknown_tables:
                warnings.append(f"以下表名不在数据字典中: {', '.join(unknown_tables)}")

        all_known_cols: set[str] = set()
        for cols in known_columns.values():
            all_known_cols.update(cols)
        if all_known_cols:
            for c in columns_used:
                if c not in all_known_cols and not c.startswith("*"):
                    unknown_columns.append(c)
            if unknown_columns and len(unknown_columns) <= 10:
                warnings.append(f"以下字段不在数据字典中: {', '.join(unknown_columns[:10])}")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "tables_used": tables_used,
        "columns_used": columns_used,
        "unknown_tables": unknown_tables,
        "unknown_columns": unknown_columns,
    }
