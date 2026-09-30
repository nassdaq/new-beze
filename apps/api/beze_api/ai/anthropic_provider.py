"""Claude API provider. Uses the official SDK; tool calls are returned, never executed here."""
from __future__ import annotations

from typing import Any

import anthropic

from .types import ProviderError, ProviderTurn, ToolCall, ToolSpec, Transcript, Usage


class AnthropicTextProvider:
    name = "anthropic"

    def __init__(self, model: str, effort: str = "medium", fallbacks: bool = True):
        self.model = model
        self.effort = effort
        self.fallbacks = fallbacks
        self.client = anthropic.AsyncAnthropic()

    def _messages(self, transcript: Transcript) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = [{"role": "user", "content": transcript.user_text}]
        for turn, results in zip(transcript.turns, transcript.results):
            messages.append({"role": "assistant", "content": turn.payload})
            if results:
                messages.append({
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": r.call_id, "content": r.content, "is_error": r.is_error}
                        for r in results
                    ],
                })
        return messages

    async def complete_with_tools(
        self, *, system: str, transcript: Transcript, tools: list[ToolSpec], max_tokens: int
    ) -> ProviderTurn:
        request: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "tools": [{"name": t.name, "description": t.description, "input_schema": t.input_schema} for t in tools],
            "messages": self._messages(transcript),
            "output_config": {"effort": self.effort},
        }
        try:
            if self.fallbacks:
                response = await self.client.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **request
                )
            else:
                response = await self.client.messages.create(**request)
        except anthropic.AuthenticationError as e:
            raise ProviderError(f"Claude API authentication failed: {e.message}") from e
        except anthropic.RateLimitError as e:
            raise ProviderError("Claude API rate limit reached; try again shortly", retryable=True) from e
        except anthropic.APIStatusError as e:
            raise ProviderError(f"Claude API error {e.status_code}: {e.message}", retryable=e.status_code >= 500) from e
        except anthropic.APIConnectionError as e:
            raise ProviderError("could not reach the Claude API", retryable=True) from e

        text = "".join(b.text for b in response.content if b.type == "text")
        calls = [ToolCall(id=b.id, name=b.name, input=dict(b.input)) for b in response.content if b.type == "tool_use"]
        stop: str
        if response.stop_reason == "refusal":
            stop = "refusal"
        elif response.stop_reason == "max_tokens":
            stop = "max_tokens"
        elif calls:
            stop = "tool_use"
        else:
            stop = "end"
        usage = Usage(input_tokens=response.usage.input_tokens, output_tokens=response.usage.output_tokens)
        return ProviderTurn(text=text, tool_calls=calls, stop=stop, usage=usage, payload=response.content, model=response.model)  # type: ignore[arg-type]
