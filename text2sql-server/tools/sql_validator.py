#!/usr/bin/env python3
"""CLI wrapper for SQL validator."""

from __future__ import annotations

from pathlib import Path

import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import click

from services.sql_validator import validate_sql


@click.command()
@click.option("--sql", "sql_path", required=True, help="SQL 文件路径")
@click.option("--dialect", default="hive", help="方言")
@click.option("--schema", "schema_path", default="", help="schema 文件路径（兼容参数）")
def main(sql_path: str, dialect: str, schema_path: str) -> None:
    _ = schema_path  # validate_sql currently reads schema from meta/schema.md
    path = Path(sql_path)
    if not path.exists():
        raise click.ClickException(f"SQL 文件不存在: {path}")
    sql = path.read_text(encoding="utf-8")
    result = validate_sql(sql, dialect=dialect, check_schema=True)
    click.echo(f"valid={result['valid']}")
    if result["errors"]:
        click.echo("errors:")
        for e in result["errors"]:
            click.echo(f"- {e}")
    if result["warnings"]:
        click.echo("warnings:")
        for w in result["warnings"]:
            click.echo(f"- {w}")


if __name__ == "__main__":
    main()
