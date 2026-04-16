"""LLM client for calling Kimi / Moonshot API."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

_DEFAULT_BASE_URL = "https://api.moonshot.cn/v1"
_DEFAULT_MODEL = "moonshot-v1-128k"
_TIMEOUT = 120.0


def _get_api_key() -> str:
    key = os.getenv("KIMI_API_KEY", "")
    if not key:
        raise RuntimeError(
            "KIMI_API_KEY not set. Copy .env.local.example to .env.local and fill in the key."
        )
    return key


def _get_base_url() -> str:
    return os.getenv("KIMI_BASE_URL", _DEFAULT_BASE_URL).rstrip("/")


def _get_model() -> str:
    return os.getenv("KIMI_MODEL", _DEFAULT_MODEL)


async def chat_completion(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.2,
    max_tokens: int = 8192,
) -> str:
    """Send a chat completion request and return the assistant message text."""
    url = f"{_get_base_url()}/chat/completions"
    headers = {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _get_model(),
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]


async def chat_completion_json(
    system_prompt: str,
    user_prompt: str,
    **kwargs: Any,
) -> dict:
    """Call LLM and parse the response as JSON (tolerant of markdown fences)."""
    text = await chat_completion(system_prompt, user_prompt, **kwargs)
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`")
    return json.loads(cleaned)
