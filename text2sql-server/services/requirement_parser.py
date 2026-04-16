"""Parse natural language or Markdown requirement docs into structured intent."""

from __future__ import annotations

import re
from typing import Any

from services.llm_client import chat_completion_json
from services.meta_extractor import load_meta_file


# ---------------------------------------------------------------------------
# Structured Intent Schema
# ---------------------------------------------------------------------------

EMPTY_INTENT: dict[str, Any] = {
    "target_metrics": [],
    "dimensions": [],
    "filters": {"include": [], "exclude": []},
    "period": "",
    "period_param": "",
    "source_table": "",
    "notes": [],
}


# ---------------------------------------------------------------------------
# Regex-based pre-extraction (lightweight, no LLM)
# ---------------------------------------------------------------------------

_PERIOD_RE = re.compile(r"(\d{4})\s*[年/-]?\s*(\d{1,2})\s*月?")
_METRIC_KEYWORDS = [
    "用户数", "用户量", "ARPU", "营收", "收入", "活跃", "新发展",
    "在网", "出账", "三无", "渠道", "发展量",
]
_DIM_KEYWORDS = ["省", "地市", "区域", "渠道", "账期", "月", "产品"]
_EXCLUDE_KEYWORDS = ["去除", "剔除", "排除", "不含", "不包含", "除外"]


def _regex_pre_extract(text: str) -> dict[str, Any]:
    """Fast pre-extraction using domain heuristics."""
    intent = {k: (v.copy() if isinstance(v, (list, dict)) else v) for k, v in EMPTY_INTENT.items()}

    period_match = _PERIOD_RE.search(text)
    if period_match:
        intent["period"] = f"{period_match.group(1)}年{period_match.group(2)}月"
        intent["period_param"] = f"{period_match.group(1)}{period_match.group(2).zfill(2)}"

    for kw in _METRIC_KEYWORDS:
        if kw in text:
            sentences = re.findall(rf"[^，。；\n]*{re.escape(kw)}[^，。；\n]*", text)
            for s in sentences:
                metric_name = s.strip().rstrip("，。；")
                if metric_name and metric_name not in intent["target_metrics"]:
                    intent["target_metrics"].append(metric_name)

    for kw in _DIM_KEYWORDS:
        if kw in text and kw not in intent["dimensions"]:
            intent["dimensions"].append(kw)

    for kw in _EXCLUDE_KEYWORDS:
        idx = text.find(kw)
        if idx >= 0:
            after = text[idx:idx + 40]
            intent["filters"]["exclude"].append(after.strip())

    return intent


# ---------------------------------------------------------------------------
# LLM-powered extraction
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
你是一个数仓需求解析专家。请将用户的取数需求（自然语言或 Markdown 需求文档）解析为结构化 JSON。

输出严格 JSON（不要 markdown 代码块），包含：
- target_metrics: string[]，需要统计的指标名称列表
- dimensions: string[]，统计维度（如"省份"、"渠道"、"账期"）
- filters: { include: string[], exclude: string[] }，包含和排除条件
- period: string，统计周期描述（如"2026年3月"）
- period_param: string，账期参数（如"202603"）
- source_table: string，主要数据来源表（如已知）
- notes: string[]，其他注意事项

{metrics_context}

请仅基于用户输入提取，不要编造信息。如果某字段无法确定，留空字符串或空数组。"""


async def parse_requirement(
    text: str,
    *,
    use_llm: bool = True,
) -> dict[str, Any]:
    """Parse a requirement text into structured intent.

    Uses regex pre-extraction first, then optionally refines with LLM.
    """
    intent = _regex_pre_extract(text)

    if not use_llm:
        return intent

    metrics_md = load_meta_file("metrics.md")
    metrics_ctx = ""
    if metrics_md:
        metrics_ctx = f"以下是已有的指标口径库，请将需求中的指标名与之对齐：\n\n{metrics_md}"

    system = _SYSTEM_PROMPT.format(metrics_context=metrics_ctx)

    try:
        llm_intent = await chat_completion_json(system, text)
        for key in EMPTY_INTENT:
            if key in llm_intent and llm_intent[key]:
                intent[key] = llm_intent[key]
    except Exception:
        pass

    return intent


# ---------------------------------------------------------------------------
# Markdown requirement -> structured fields (section parsing)
# ---------------------------------------------------------------------------

_SECTION_PATTERNS = {
    "target_metrics": re.compile(r"(?:输出字段|统计指标|Output Fields)", re.IGNORECASE),
    "dimensions": re.compile(r"(?:统计维度|维度|Aggregation|Grouping)", re.IGNORECASE),
    "filters": re.compile(r"(?:筛选|过滤|排除|Target Audience|Filters)", re.IGNORECASE),
    "period": re.compile(r"(?:账期|统计周期|时间范围|Period)", re.IGNORECASE),
}


def parse_markdown_sections(md_text: str) -> dict[str, str]:
    """Split a Markdown requirement doc into named sections."""
    sections: dict[str, str] = {}
    current_key: str | None = None
    buf: list[str] = []

    for line in md_text.splitlines():
        matched = False
        for key, pat in _SECTION_PATTERNS.items():
            if pat.search(line):
                if current_key and buf:
                    sections[current_key] = "\n".join(buf).strip()
                current_key = key
                buf = []
                matched = True
                break
        if not matched:
            buf.append(line)

    if current_key and buf:
        sections[current_key] = "\n".join(buf).strip()

    return sections
