#!/usr/bin/env python3
"""CLI wrapper for requirement parser."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import click

from services.requirement_parser import parse_requirement


@click.command()
@click.option("--input", "input_value", required=True, help="文本或文件路径")
@click.option("--no-llm", is_flag=True, default=False, help="禁用 LLM，仅正则解析")
def main(input_value: str, no_llm: bool) -> None:
    p = Path(input_value)
    if p.exists() and p.is_file():
        text = p.read_text(encoding="utf-8", errors="replace")
    else:
        text = input_value
    intent = asyncio.run(parse_requirement(text, use_llm=not no_llm))
    click.echo(json.dumps(intent, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
