"""CLI entry point for Text2SQL tools (independent of the web server)."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table as RichTable

sys.path.insert(0, str(Path(__file__).resolve().parent))

console = Console()

# Ensure .env.local is loaded for LLM keys
_env_file = Path(__file__).resolve().parent.parent / ".env.local"
if _env_file.exists():
    for line in _env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


@click.group()
def cli():
    """Text2SQL 智能取数工具链"""


@cli.command()
@click.option("--name", default="my_project", help="项目名称")
@click.option("--dialect", default="hive", help="默认 SQL 方言")
@click.option("--output", default=".", help="输出目录")
def init(name: str, dialect: str, output: str):
    """初始化新的 Text2SQL 项目目录结构。"""
    base = Path(output) / name
    dirs = ["meta", "requirements", "output", "raw_materials"]
    for d in dirs:
        (base / d).mkdir(parents=True, exist_ok=True)

    config_content = f"""project:
  name: "{name}"
  dialect: "{dialect}"

paths:
  meta_dir: "./meta"
  output_dir: "./output"
"""
    (base / "config.yaml").write_text(config_content, encoding="utf-8")

    readme = f"# {name}\n\nText2SQL 项目。将素材文件放入 `raw_materials/`，然后运行 `extract-meta`。\n"
    (base / "README.md").write_text(readme, encoding="utf-8")

    console.print(f"[green]已创建项目目录: {base}[/green]")
    for d in dirs:
        console.print(f"  📁 {d}/")


@cli.command("extract-meta")
@click.option("--input", "-i", "input_dir", required=True, help="素材文件目录")
@click.option("--output", "-o", "output_dir", default=None, help="元数据输出目录（默认 ./meta）")
def extract_meta(input_dir: str, output_dir: str | None):
    """从素材文件自动提取元数据（schema.md + metrics.md 等）。"""
    from services.meta_extractor import META_DIR, extract_and_save

    if output_dir:
        import services.meta_extractor as me
        me.META_DIR = Path(output_dir)

    input_path = Path(input_dir)
    if not input_path.exists():
        console.print(f"[red]目录不存在: {input_path}[/red]")
        raise SystemExit(1)

    ddl_text = ""
    sql_text = ""
    requirement_text = ""
    code_table_text = ""

    for f in sorted(input_path.iterdir()):
        if f.is_dir():
            continue
        content = f.read_text(encoding="utf-8", errors="replace")
        lower = f.name.lower()

        if "ddl" in lower or lower.endswith(".ddl"):
            ddl_text += content + "\n"
            console.print(f"  📄 DDL: {f.name}")
        elif "样例" in f.name or "sample" in lower or lower == "3.样例sql.md":
            sql_text += content + "\n"
            console.print(f"  📄 样例SQL: {f.name}")
        elif "码表" in f.name or "code" in lower:
            code_table_text += content + "\n"
            console.print(f"  📄 码表: {f.name}")
        elif lower.endswith(".md") or lower.endswith(".txt"):
            requirement_text += content + "\n"
            console.print(f"  📄 需求/文档: {f.name}")

    saved = asyncio.run(extract_and_save(
        ddl_text=ddl_text or None,
        sample_sql_text=sql_text or None,
        requirement_text=requirement_text or None,
        code_table_text=code_table_text or None,
    ))

    if saved:
        console.print(f"\n[green]已生成 {len(saved)} 个元数据文件:[/green]")
        for name in saved:
            console.print(f"  ✅ {META_DIR / name}")
    else:
        console.print("[yellow]未提取到任何元数据，请检查素材文件。[/yellow]")


@cli.command("validate")
@click.option("--sql", "-s", "sql_file", required=True, help="SQL 文件路径")
@click.option("--dialect", "-d", default="hive", help="SQL 方言")
@click.option("--schema/--no-schema", default=True, help="是否检查 Schema 一致性")
def validate(sql_file: str, dialect: str, schema: bool):
    """校验 SQL 语法和 Schema 一致性。"""
    from services.sql_validator import validate_sql

    path = Path(sql_file)
    if not path.exists():
        console.print(f"[red]文件不存在: {path}[/red]")
        raise SystemExit(1)

    sql = path.read_text(encoding="utf-8")
    result = validate_sql(sql, dialect=dialect, check_schema=schema)

    if result["valid"]:
        console.print("[green]✅ SQL 校验通过[/green]")
    else:
        console.print("[red]❌ SQL 校验失败[/red]")
        for e in result["errors"]:
            console.print(f"  [red]错误: {e}[/red]")

    for w in result["warnings"]:
        console.print(f"  [yellow]警告: {w}[/yellow]")

    if result["tables_used"]:
        console.print(f"\n  使用的表: {', '.join(result['tables_used'])}")
    if result["unknown_tables"]:
        console.print(f"  [yellow]未知表: {', '.join(result['unknown_tables'])}[/yellow]")


@cli.command("convert")
@click.option("--input", "-i", "input_file", required=True, help="输入 SQL 文件")
@click.option("--from", "-f", "from_dialect", default="hive", help="源方言")
@click.option("--to", "-t", "to_dialect", default="maxcompute", help="目标方言")
@click.option("--output", "-o", "output_file", default=None, help="输出文件（默认打印到终端）")
def convert(input_file: str, from_dialect: str, to_dialect: str, output_file: str | None):
    """转换 SQL 方言（Hive/MaxCompute/Spark/MySQL/PG）。"""
    from services.dialect_converter import convert_dialect

    path = Path(input_file)
    if not path.exists():
        console.print(f"[red]文件不存在: {path}[/red]")
        raise SystemExit(1)

    sql = path.read_text(encoding="utf-8")
    result = convert_dialect(sql, from_dialect, to_dialect)

    if result["success"]:
        if output_file:
            Path(output_file).write_text(result["sql"], encoding="utf-8")
            console.print(f"[green]已转换并保存到: {output_file}[/green]")
        else:
            console.print(f"[green]从 {from_dialect} 转换为 {to_dialect}:[/green]\n")
            console.print(result["sql"])
    else:
        console.print(f"[red]转换失败: {result['error']}[/red]")


@cli.command("status")
def status():
    """查看当前元数据文件状态。"""
    from services.meta_extractor import META_DIR, list_meta_files

    table = RichTable(title="元数据文件状态")
    table.add_column("文件", style="cyan")
    table.add_column("状态")
    table.add_column("大小")

    files = list_meta_files()
    for name, exists in files.items():
        if exists:
            size = (META_DIR / name).stat().st_size
            table.add_row(name, "[green]✅ 存在[/green]", f"{size:,} bytes")
        else:
            table.add_row(name, "[red]❌ 缺失[/red]", "-")

    console.print(table)


if __name__ == "__main__":
    cli()
