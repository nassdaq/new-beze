"""Provider for self-hosted models behind an OpenAI-style chat-completions endpoint with tool calling
(vLLM, Ollama, LM Studio, TGI). This is how the user's own GPUs plug in. Not used for Claude."""
from __future__ import annotations

import json
from typing import Any

import httpx

from .types import ProviderError, ProviderTurn, ToolCall, ToolSpec, Transcript, Usage


class OpenAICompatibleTextProvider:
    name = "openai_compatible"

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 300.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def _messages(self, system: str, transcript: Transcript) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": transcript.user_text},
        ]
        for turn, results in zip(transcript.turns, transcript.results):
            messages.append(turn.payload)
            for r in results:
                messages.append({"role": "tool", "tool_call_id": r.call_id, "content": r.content})
        return messages

    async def complete_with_tools(
        self, *, system: str, transcript: Transcript, tools: list[ToolSpec], max_tokens: int
    ) -> ProviderTurn:
        body = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": self._messages(system, transcript),
            "tools": [
                {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.input_schema}}
                for t in tools
            ],
            "tool_choice": "auto",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=body,
                )
        except httpx.HTTPError as e:
            raise ProviderError(f"could not reach the model server at {self.base_url}: {e}", retryable=True) from e
        if r.status_code >= 400:
            raise ProviderError(f"model server error {r.status_code}: {r.text[:300]}", retryable=r.status_code >= 500)
        data = r.json()
        choice = data["choices"][0]
        message = choice["message"]
        calls: list[ToolCall] = []
        for tc in message.get("tool_calls") or []:
            fn = tc.get("function", {})
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {"__invalid_json__": fn.get("arguments")}
            calls.append(ToolCall(id=tc["id"], name=fn.get("name", ""), input=args))
        finish = choice.get("finish_reason")
        stop = "max_tokens" if finish == "length" else ("tool_use" if calls else "end")
        usage = Usage(
            input_tokens=(data.get("usage") or {}).get("prompt_tokens", 0),
            output_tokens=(data.get("usage") or {}).get("completion_tokens", 0),
        )
        return ProviderTurn(text=message.get("content") or "", tool_calls=calls, stop=stop, usage=usage, payload=message, model=data.get("model", self.model))
