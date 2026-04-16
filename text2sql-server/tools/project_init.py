#!/usr/bin/env python3
"""Project initializer for Text2SQL skill projects."""

from __future__ import annotations

from pathlib import Path

import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import click


@click.command()
@click.option("--name", default="text2sql-project", help="项目名称")
@click.option("--dialect", default="hive", help="默认 SQL 方言")
@click.option("--output", default=".", help="输出目录")
def main(name: str, dialect: str, output: str) -> None:
    base = Path(output) / name
    for d in ("meta", "requirements", "output", "raw_materials", "prompts", "templates"):
        (base / d).mkdir(parents=True, exist_ok=True)

    config_text = f"""project:\n  name: \"{name}\"\n  dialect: \"{dialect}\"\n\npaths:\n  meta_dir: \"./meta\"\n  output_dir: \"./output\"\n"""
    (base / "config.yaml").write_text(config_text, encoding="utf-8")

    readme_text = (
        f"# {name}\\n\\n"
        "1. 将素材文件放入 raw_materials/\\n"
        "2. 运行 python tools/meta_extractor.py --input ./raw_materials --output ./meta\\n"
        "3. 按需运行 requirement/sql_validator/dialect_converter\\n"
    )
    (base / "README.md").write_text(readme_text, encoding="utf-8")
    click.echo(f"Initialized project at: {base}")


if __name__ == "__main__":
    main()
