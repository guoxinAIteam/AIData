#!/usr/bin/env python3
"""CLI wrapper for SQL dialect converter."""

from __future__ import annotations

from pathlib import Path

import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import click

from services.dialect_converter import convert_dialect


@click.command()
@click.option("--input", "input_path", required=True, help="输入 SQL 文件")
@click.option("--from", "from_dialect", default="hive", help="源方言")
@click.option("--to", "to_dialect", default="maxcompute", help="目标方言")
@click.option("--output", "output_path", default="", help="输出文件路径")
def main(input_path: str, from_dialect: str, to_dialect: str, output_path: str) -> None:
    path = Path(input_path)
    if not path.exists():
        raise click.ClickException(f"输入 SQL 不存在: {path}")
    sql = path.read_text(encoding="utf-8")
    result = convert_dialect(sql, source_dialect=from_dialect, target_dialect=to_dialect)
    if not result["success"]:
        raise click.ClickException(result["error"] or "转换失败")
    if output_path:
        Path(output_path).write_text(result["sql"], encoding="utf-8")
        click.echo(f"已输出: {output_path}")
    else:
        click.echo(result["sql"])


if __name__ == "__main__":
    main()
