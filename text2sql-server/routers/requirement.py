"""Router for requirement parsing (NL / Markdown -> structured intent)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from services.requirement_parser import parse_markdown_sections, parse_requirement

router = APIRouter()


class ParseRequirementRequest(BaseModel):
    text: str
    use_llm: bool = True


@router.post("/parse-requirement")
async def api_parse_requirement(body: ParseRequirementRequest):
    """Parse a natural language or Markdown requirement into structured intent."""
    intent = await parse_requirement(body.text, use_llm=body.use_llm)
    sections = parse_markdown_sections(body.text)
    return {
        "success": True,
        "intent": intent,
        "detected_sections": list(sections.keys()),
    }
