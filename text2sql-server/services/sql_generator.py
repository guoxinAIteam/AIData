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

from services.llm_client import chat_completion_json
from services.meta_extractor import load_meta_file
from services import rag_service
from services.skill_rule_engine import match_rules, parse_skill_context


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def _build_meta_context() -> str:
    """Load all available meta files and concatenate for LLM context."""
    # Keep context compact for 8k models to avoid token-limit failures.
    max_file_chars = 2200
    max_total_chars = 5200
    parts: list[str] = []
    used = 0
    for name, label in [
        ("schema.md", "数据字典"),
        ("metrics.md", "指标口径库"),
        ("code_tables.md", "码表数据"),
        ("sample_sql.md", "样例SQL"),
    ]:
        content = load_meta_file(name)
        if content:
            trimmed = content
            if len(trimmed) > max_file_chars:
                trimmed = (
                    trimmed[: max_file_chars - 120]
                    + "\n\n[...已截断，完整内容请在源文件查看...]\n"
                )
            chunk = f"### {label}\n\n{trimmed}"
            if used + len(chunk) > max_total_chars:
                remain = max_total_chars - used
                if remain <= 0:
                    break
                chunk = chunk[:remain] + "\n\n[...上下文总长度已截断...]\n"
            parts.append(chunk)
            used += len(chunk)
            if used >= max_total_chars:
                break
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
- 每个核心结论标注来源（如"依据：数据字典-DWA_V_M_CUS_CB_USER_INFO"）
- 约束优先级：Skill 硬约束 > Skill 软约束 > metrics.md > sample_sql.md"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _intent_to_query(intent: dict[str, Any]) -> str:
    """Extract a search query from the structured intent for RAG retrieval."""
    parts: list[str] = []
    metrics = intent.get("metrics") or intent.get("target_metrics") or []
    for m in metrics:
        if isinstance(m, dict):
            parts.append(m.get("name", ""))
        elif isinstance(m, str):
            parts.append(m)
    dims = intent.get("dimensions") or []
    for d in dims:
        if isinstance(d, str):
            parts.append(d)
    filters = intent.get("filters") or []
    for f in filters:
        if isinstance(f, dict):
            parts.append(f.get("field", ""))
    notes = intent.get("notes") or []
    for n in notes:
        if isinstance(n, str):
            parts.append(n)
    if intent.get("description"):
        parts.append(str(intent["description"]))
    if intent.get("period"):
        parts.append(str(intent["period"]))
    return " ".join(p for p in parts if p)


def _format_rag_chunks(chunks: list[dict[str, Any]]) -> str:
    """Format RAG retrieval results into LLM-readable context."""
    sections: list[str] = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata", {})
        source = meta.get("source_file", "unknown")
        section = meta.get("section_title", "")
        header = f"### RAG检索片段 {i}（来源: {source}"
        if section:
            header += f" / {section}"
        header += f", 相似度: {chunk.get('score', 0):.2f}）"
        sections.append(f"{header}\n\n{chunk.get('text', '')}")
    return "\n\n---\n\n".join(sections)


_RAG_CONTEXT_SUFFICIENT_THRESHOLD = 800


async def generate_sql(
    intent: dict[str, Any],
    *,
    dialect: str = "hive",
    skill_context: str = "",
    collection_id: str = "",
) -> dict[str, Any]:
    """Generate SQL from structured intent using the 5-step pipeline.

    Uses RAG-first strategy: retrieves relevant chunks from ChromaDB when
    collection_id is provided, falls back to static meta files otherwise.

    Returns dict with keys: field_mapping, sql, execution_notes,
    chain_of_thought, warnings, rag_chunks_used.
    """
    rag_context = ""
    rag_chunks_used: list[dict[str, Any]] = []

    if collection_id:
        query_text = _intent_to_query(intent)
        if query_text:
            try:
                chunks = rag_service.query(collection_id, query_text, top_k=5)
                if chunks:
                    rag_context = _format_rag_chunks(chunks)
                    rag_chunks_used = chunks
            except Exception:
                pass

    if rag_context:
        meta_context = rag_context
        if len(rag_context) < _RAG_CONTEXT_SUFFICIENT_THRESHOLD:
            fallback = _build_meta_context()
            if fallback:
                meta_context += "\n\n---\n\n" + fallback
    else:
        meta_context = _build_meta_context()

    if not meta_context:
        return {
            "field_mapping": [],
            "sql": "",
            "execution_notes": "",
            "chain_of_thought": ["元数据知识库为空，请先上传素材并执行元数据提取。"],
            "warnings": ["meta/ 目录下无任何知识文件，无法生成 SQL。"],
            "matched_skill_rule": False,
            "matched_rule_names": [],
            "fallback_reason": "meta context missing",
            "rag_chunks_used": [],
        }

    system = _SYSTEM_PROMPT.format(meta_context=meta_context, dialect=dialect)
    hard_constraints, soft_constraints = _split_skill_constraints(skill_context)

    user_parts = [f"## 结构化取数意图\n\n```json\n{_safe_json(intent)}\n```"]
    if hard_constraints:
        user_parts.append(f"\n## Skill硬约束(必须遵守)\n\n{hard_constraints}")
    if soft_constraints:
        user_parts.append(f"\n## Skill软约束(优先参考)\n\n{soft_constraints}")
    user_msg = "\n".join(user_parts)

    parsed_rules = parse_skill_context(skill_context)
    rule_match_result = match_rules(intent, parsed_rules)

    # Rule-first branch: if matched, draft SQL first and then ask LLM to refine/complete
    if rule_match_result["matched"]:
        refined = await _refine_rule_sql(
            system=system,
            intent=intent,
            rule_sql_draft=rule_match_result["rule_sql_draft"],
            hard_constraints=hard_constraints,
            soft_constraints=soft_constraints,
        )
        refined.setdefault("field_mapping", [])
        refined.setdefault("sql", rule_match_result["rule_sql_draft"])
        refined.setdefault("execution_notes", "")
        refined.setdefault(
            "chain_of_thought",
            [
                "解析自然语言需求",
                "命中 Skill 规则，优先采用规则草案",
                "基于元数据补全/优化 SQL",
            ],
        )
        refined.setdefault("warnings", [])
        refined["matched_skill_rule"] = True
        refined["matched_rule_names"] = rule_match_result["matched_rule_names"]
        refined["fallback_reason"] = None
        refined["rag_chunks_used"] = rag_chunks_used
        return refined

    try:
        result = await chat_completion_json(system, user_msg)
    except Exception as exc:
        return {
            "field_mapping": [],
            "sql": "",
            "execution_notes": "",
            "chain_of_thought": [f"LLM 调用失败: {exc}"],
            "warnings": [str(exc)],
            "matched_skill_rule": False,
            "matched_rule_names": [],
            "fallback_reason": str(rule_match_result.get("fallback_reason") or "LLM error"),
            "rag_chunks_used": rag_chunks_used,
        }

    for key in ("field_mapping", "sql", "execution_notes", "chain_of_thought", "warnings"):
        result.setdefault(key, [] if key in ("field_mapping", "chain_of_thought", "warnings") else "")
    result.setdefault("matched_skill_rule", False)
    result.setdefault("matched_rule_names", [])
    result.setdefault("fallback_reason", rule_match_result.get("fallback_reason"))
    result["rag_chunks_used"] = rag_chunks_used

    return result


def _safe_json(obj: Any) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False, indent=2)


def _split_skill_constraints(skill_context: str) -> tuple[str, str]:
    """Split skill text into hard and soft constraints."""
    if not skill_context.strip():
        return "", ""
    hard_lines: list[str] = []
    soft_lines: list[str] = []
    for line in skill_context.splitlines():
        t = line.strip()
        if not t:
            continue
        if any(k in t for k in ("必须", "禁止", "不可", "强制", "约束", "排除", "去除")):
            hard_lines.append(t)
        else:
            soft_lines.append(t)
    return "\n".join(hard_lines), "\n".join(soft_lines)


async def _refine_rule_sql(
    *,
    system: str,
    intent: dict[str, Any],
    rule_sql_draft: str,
    hard_constraints: str,
    soft_constraints: str,
) -> dict[str, Any]:
    """Refine rule-first SQL with LLM; fallback to draft on failure."""
    user_parts = [
        "## 规则优先SQL草案\n```sql\n" + rule_sql_draft + "\n```",
        "## 结构化取数意图\n```json\n" + _safe_json(intent) + "\n```",
    ]
    if hard_constraints:
        user_parts.append("## Skill硬约束(必须遵守)\n" + hard_constraints)
    if soft_constraints:
        user_parts.append("## Skill软约束(优先参考)\n" + soft_constraints)
    user_parts.append(
        "请在不违反硬约束的前提下优化 SQL，并输出既定 JSON 字段。若无法优化，保留原草案并在 warnings 说明。"
    )
    try:
        return await chat_completion_json(system, "\n\n".join(user_parts))
    except Exception as exc:
        return {
            "field_mapping": [],
            "sql": rule_sql_draft,
            "execution_notes": "已命中 Skill 规则并返回规则草案；LLM 优化失败。",
            "chain_of_thought": [
                "解析需求",
                "命中 Skill 规则",
                "生成规则 SQL 草案",
                f"LLM 优化失败: {exc}",
            ],
            "warnings": [f"LLM 优化失败，已回退规则草案: {exc}"],
        }
