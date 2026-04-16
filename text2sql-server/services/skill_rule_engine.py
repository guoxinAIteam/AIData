"""Skill rule engine for advanced Text2SQL mode.

Parses skill_context into simple rule units and performs rule-first matching.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class SkillRule:
    """A parsed rule unit from one skill context block."""

    name: str
    trigger_terms: list[str]
    exclude_terms: list[str]
    forced_filters: list[str]
    preferred_tables: list[str]


def parse_skill_context(skill_context: str) -> list[SkillRule]:
    """Parse plain text skill context into structured rule list."""
    if not skill_context.strip():
        return []

    blocks = [b.strip() for b in skill_context.split("【") if b.strip()]
    rules: list[SkillRule] = []

    for block in blocks:
        # Expected block style: "SkillName】\nsummary...\n触发条件：...\n步骤：..."
        name_part, sep, body = block.partition("】")
        if not sep:
            continue
        name = name_part.strip() or "未命名Skill"
        text = body.strip()

        trigger_terms = _extract_trigger_terms(text)
        exclude_terms = _extract_exclude_terms(text)
        forced_filters = _extract_forced_filters(text)
        preferred_tables = _extract_preferred_tables(text)

        rules.append(
            SkillRule(
                name=name,
                trigger_terms=trigger_terms,
                exclude_terms=exclude_terms,
                forced_filters=forced_filters,
                preferred_tables=preferred_tables,
            )
        )

    return rules


def match_rules(intent: dict[str, Any], rules: list[SkillRule]) -> dict[str, Any]:
    """Match intent against parsed skill rules and return rule-first signals."""
    text_parts = [
        *intent.get("target_metrics", []),
        *intent.get("dimensions", []),
        *intent.get("notes", []),
        intent.get("period", ""),
    ]
    merged = " ".join([str(x) for x in text_parts if x]).lower()

    matched_rules: list[SkillRule] = []
    for rule in rules:
        if not rule.trigger_terms:
            # no explicit trigger terms => weak rule, considered matched only if intent exists
            if merged:
                matched_rules.append(rule)
            continue

        # Any trigger term hit and no exclude conflict
        hit = any(t.lower() in merged for t in rule.trigger_terms)
        conflict = any(ex.lower() in merged for ex in rule.exclude_terms)
        if hit and not conflict:
            matched_rules.append(rule)

    if not matched_rules:
        return {
            "matched": False,
            "matched_rule_names": [],
            "forced_filters": [],
            "preferred_tables": [],
            "rule_sql_draft": "",
            "fallback_reason": "未命中 Skill 规则，回退 LLM 五步生成。",
        }

    merged_filters: list[str] = []
    merged_tables: list[str] = []
    for r in matched_rules:
        for f in r.forced_filters:
            if f not in merged_filters:
                merged_filters.append(f)
        for t in r.preferred_tables:
            if t not in merged_tables:
                merged_tables.append(t)

    sql_draft = _build_rule_sql_draft(intent, merged_filters, merged_tables)
    return {
        "matched": True,
        "matched_rule_names": [r.name for r in matched_rules],
        "forced_filters": merged_filters,
        "preferred_tables": merged_tables,
        "rule_sql_draft": sql_draft,
        "fallback_reason": None,
    }


def _extract_trigger_terms(text: str) -> list[str]:
    terms: list[str] = []
    for pat in (r"触发条件[:：]\s*(.+)", r"适用场景[:：]\s*(.+)"):
        m = re.search(pat, text)
        if m:
            terms.extend(_split_terms(m.group(1)))
    return _uniq(terms)


def _extract_exclude_terms(text: str) -> list[str]:
    terms: list[str] = []
    for pat in (r"排除[:：]\s*(.+)", r"不包含[:：]\s*(.+)", r"去除[:：]\s*(.+)"):
        m = re.search(pat, text)
        if m:
            terms.extend(_split_terms(m.group(1)))
    return _uniq(terms)


def _extract_forced_filters(text: str) -> list[str]:
    filters: list[str] = []
    for kw in ("去除副卡", "排除副卡", "IS_STAT = '1'", "IS_IOT = '0'"):
        if kw in text:
            filters.append(kw)
    return _uniq(filters)


def _extract_preferred_tables(text: str) -> list[str]:
    candidates = re.findall(r"\b[A-Z][A-Z0-9_]{4,}\b", text)
    return _uniq(candidates)


def _build_rule_sql_draft(intent: dict[str, Any], forced_filters: list[str], preferred_tables: list[str]) -> str:
    metrics = intent.get("target_metrics", [])
    dims = intent.get("dimensions", [])
    period_param = intent.get("period_param") or "${month_id}"
    table = preferred_tables[0] if preferred_tables else "DWA_V_M_CUS_CB_USER_INFO"

    select_cols = ["MONTH_ID"]
    if any("省" in d for d in dims):
        select_cols.append("PROV_ID")
    select_cols.append("COUNT(DISTINCT USER_ID) AS metric_value")

    where_parts = [f"MONTH_ID = '{period_param}'"]
    for f in forced_filters:
        if f in ("去除副卡", "排除副卡"):
            where_parts.append("-- 去除副卡规则需按业务口径补充")
        elif "=" in f:
            where_parts.append(f)

    comment = f"-- 规则优先草案: metrics={','.join(metrics) if metrics else 'unknown'}"
    sql = (
        f"{comment}\n"
        f"SELECT {', '.join(select_cols)}\n"
        f"FROM {table}\n"
        f"WHERE " + "\n  AND ".join(where_parts) + "\n"
        f"GROUP BY " + ", ".join([c for c in select_cols if c != "COUNT(DISTINCT USER_ID) AS metric_value"]) + ";"
    )
    return sql


def _split_terms(s: str) -> list[str]:
    return [x.strip() for x in re.split(r"[，,、;；\s]+", s) if x.strip()]


def _uniq(items: list[str]) -> list[str]:
    out: list[str] = []
    for i in items:
        if i not in out:
            out.append(i)
    return out

