#!/usr/bin/env python3
"""CLI wrapper for metadata extraction service."""

from __future__ import annotations

import asyncio
from pathlib import Path

import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import click

import services.meta_extractor as me
from services.meta_extractor import extract_and_save


@click.command()
@click.option("--input", "input_dir", required=True, help="素材目录")
@click.option("--output", "output_dir", default="./meta", help="输出元数据目录")
def main(input_dir: str, output_dir: str) -> None:
    input_path = Path(input_dir)
    if not input_path.exists():
        raise click.ClickException(f"输入目录不存在: {input_path}")

    me.META_DIR = Path(output_dir)
    ddl_text = ""
    sample_sql_text = ""
    requirement_text = ""
    code_table_text = ""
    data_dictionary_xlsx_paths: list[Path] = []
    metrics_kb_xlsx_paths: list[Path] = []

    for f in sorted(input_path.iterdir()):
        if f.is_dir():
            continue
        lower = f.name.lower()
        if f.suffix.lower() == ".xlsx":
            if "数据字典" in f.name:
                data_dictionary_xlsx_paths.append(f)
            elif "指标口径" in f.name:
                metrics_kb_xlsx_paths.append(f)
            continue

        content = f.read_text(encoding="utf-8", errors="replace")
        if "ddl" in lower or lower.endswith(".ddl"):
            ddl_text += content + "\n"
        elif "样例" in f.name or "sample" in lower or lower.endswith(".sql"):
            sample_sql_text += content + "\n"
        elif "码表" in f.name or "code" in lower:
            code_table_text += content + "\n"
        elif lower.endswith(".md") or lower.endswith(".txt"):
            requirement_text += content + "\n"

    saved = asyncio.run(
        extract_and_save(
            ddl_text=ddl_text or None,
            sample_sql_text=sample_sql_text or None,
            requirement_text=requirement_text or None,
            code_table_text=code_table_text or None,
            data_dictionary_xlsx_paths=data_dictionary_xlsx_paths or None,
            metrics_kb_xlsx_paths=metrics_kb_xlsx_paths or None,
        )
    )

    if not saved:
        click.echo("未生成任何元数据文件。")
    else:
        click.echo("生成文件:")
        for k in saved:
            click.echo(f"- {k}")


if __name__ == "__main__":
    main()
