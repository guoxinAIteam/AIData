"""LLM client for calling Kimi / Moonshot API."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

_DEFAULT_BASE_URL = "https://api.moonshot.cn/v1"
_DEFAULT_MODEL = "moonshot-v1-8k"
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
    value = os.getenv("KIMI_MODEL", "")
    return value.strip() or _DEFAULT_MODEL


def _candidate_base_urls() -> list[str]:
    """Build retry candidates for Moonshot base URL.

    If configured URL returns 404, we auto-try the alternate official domain
    to avoid runtime failures caused by environment drift.
    """
    configured = _get_base_url()
    candidates = [configured]
    alternates = [
        "https://api.moonshot.ai/v1",
        "https://api.moonshot.cn/v1",
    ]
    for alt in alternates:
        if alt != configured:
            candidates.append(alt)
    return candidates


async def chat_completion(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.2,
    max_tokens: int = 1024,
) -> str:
    """Send a chat completion request and return the assistant message text."""
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
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for base in _candidate_base_urls():
            url = f"{base}/chat/completions"
            try:
                resp = await client.post(url, headers=headers, json=payload)
                # Retry next candidate on 404; fail fast on other statuses.
                if resp.status_code == 404:
                    last_error = httpx.HTTPStatusError(
                        f"404 from {url}",
                        request=resp.request,
                        response=resp,
                    )
                    continue
                if resp.status_code >= 400:
                    detail = resp.text[:800]
                    raise RuntimeError(
                        f"LLM HTTP {resp.status_code} from {url}: {detail}"
                    )
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except Exception as exc:  # noqa: BLE001 - preserve detailed upstream error
                last_error = exc
                # For non-404 issues, stop retrying to avoid masking auth/quota errors.
                if not (isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 404):
                    break
    if last_error is not None:
        raise last_error
    raise RuntimeError("LLM request failed without a concrete error")


async def chat_completion_json(
    system_prompt: str,
    user_prompt: str,
    **kwargs: Any,
) -> dict:
    """Call LLM and parse the response as JSON (tolerant of markdown fences)."""
    text = await chat_completion(system_prompt, user_prompt, **kwargs)
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`")
    return json.loads(cleaned)
