"""SQL generator: 5-step pipeline from structured intent to executable SQL.

Steps:
  1. Column alignment — map each output field to metrics.md definitions
  2. Core table selection — identify main table and joins from schema.md
  3. Code table mapping — ID -> name conversions from code_tables.md
  4. Style alignment — match coding conventions from sample_sql.md
  5. SQL generation — produce annotated SQL + field mapping table
"""

from __future__ import annotations

from typing import Any

from services.llm_client import chat_completion, chat_completion_json
from services.meta_extractor import load_meta_file


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def _build_meta_context() -> str:
    """Load all available meta files and concatenate for LLM context."""
    parts: list[str] = []
    for name, label in [
        ("schema.md", "数据字典"),
        ("metrics.md", "指标口径库"),
        ("code_tables.md", "码表数据"),
        ("sample_sql.md", "样例SQL"),
    ]:
        content = load_meta_file(name)
        if content:
            parts.append(f"### {label}\n\n{content}")
    return "\n\n---\n\n".join(parts) if parts else ""


# ---------------------------------------------------------------------------
# System prompt (5-step pipeline)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
你是一个专业的数仓 SQL 开发专家。请严格按照以下 5 步流程，根据用户的结构化取数意图和元数据上下文，生成高质量的可执行 SQL。

## 元数据上下文

{meta_context}

## 5 步生成流程

**步骤 1: 逐列对齐**
将需求中每个输出字段与指标口径库（metrics.md）的对应关系进行匹配，明确每列的核心口径定义、计算逻辑、关联字段。

**步骤 2: 定核心表**
参考数据字典（schema.md）确定 SQL 的核心表、关联表、关联键、基础过滤条件（如移网用户限定、有效用户过滤）。

**步骤 3: 码表转名**
结合码表数据（code_tables.md）完成编码→名称的转换（如 prov_id→省分名称）、状态判定（如是否物联网/隐私号）。

**步骤 4: 风格对齐**
参考样例 SQL（sample_sql.md）的语法规范（如 JOIN 方式、函数用法、分组排序），确保 SQL 符合项目编码规范。

**步骤 5: 生成 SQL**
输出完整可执行的 {dialect} SQL，同时标注每列/每个过滤条件对应的依据来源。

## 输出要求

输出严格 JSON（不要 markdown 代码块），包含以下字段：
- field_mapping: 数组，每项含 {{ field_name, metric_source, calculation_logic }}
- sql: string，完整可执行 SQL（含注释）
- execution_notes: string，执行说明（账期替换、筛选替换、结果校验建议）
- chain_of_thought: string[]，每步推理的简要说明
- warnings: string[]，缺失信息或不确定之处

## 核心规则
- 所有结论 100% 来源于上述元数据文件，禁止编造
- 缺失口径时标注 "[待补充: 指标XXX在口径库中未找到定义]"
- 每个核心结论标注来源（如"依据：数据字典-DWA_V_M_CUS_CB_USER_INFO"）"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_sql(
    intent: dict[str, Any],
    *,
    dialect: str = "hive",
    skill_context: str = "",
) -> dict[str, Any]:
    """Generate SQL from structured intent using the 5-step pipeline.

    Returns dict with keys: field_mapping, sql, execution_notes,
    chain_of_thought, warnings.
    """
    meta_context = _build_meta_context()
    if not meta_context:
        return {
            "field_mapping": [],
            "sql": "",
            "execution_notes": "",
            "chain_of_thought": ["元数据知识库为空，请先上传素材并执行元数据提取。"],
            "warnings": ["meta/ 目录下无任何知识文件，无法生成 SQL。"],
        }

    system = _SYSTEM_PROMPT.format(meta_context=meta_context, dialect=dialect)

    user_parts = [f"## 结构化取数意图\n\n```json\n{_safe_json(intent)}\n```"]
    if skill_context:
        user_parts.append(f"\n## Skill 知识上下文\n\n{skill_context}")
    user_msg = "\n".join(user_parts)

    try:
        result = await chat_completion_json(system, user_msg)
    except Exception as exc:
        return {
            "field_mapping": [],
            "sql": "",
            "execution_notes": "",
            "chain_of_thought": [f"LLM 调用失败: {exc}"],
            "warnings": [str(exc)],
        }

    for key in ("field_mapping", "sql", "execution_notes", "chain_of_thought", "warnings"):
        result.setdefault(key, [] if key in ("field_mapping", "chain_of_thought", "warnings") else "")

    return result


def _safe_json(obj: Any) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False, indent=2)
