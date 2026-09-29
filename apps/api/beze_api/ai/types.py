"""Provider-neutral shapes. Providers translate these to and from their wire formats."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass(frozen=True)
class ToolResult:
    call_id: str
    content: str
    is_error: bool = False


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def add(self, other: "Usage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens


StopReason = Literal["end", "tool_use", "max_tokens", "refusal"]


@dataclass
class ProviderTurn:
    text: str
    tool_calls: list[ToolCall]
    stop: StopReason
    usage: Usage
    #: Whatever the provider needs to replay this assistant turn verbatim.
    payload: Any = None
    model: str = ""


@dataclass
class Transcript:
    """Neutral conversation log. Each provider renders it to its own message format."""

    user_text: str
    turns: list[ProviderTurn] = field(default_factory=list)
    results: list[list[ToolResult]] = field(default_factory=list)

    def append(self, turn: ProviderTurn, results: list[ToolResult]) -> None:
        self.turns.append(turn)
        self.results.append(results)


class TextProvider(Protocol):
    name: str

    async def complete_with_tools(
        self, *, system: str, transcript: Transcript, tools: list[ToolSpec], max_tokens: int
    ) -> ProviderTurn: ...


class ProviderError(RuntimeError):
    """A provider failed in a way the caller can report. `retryable` hints at transient causes."""

    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable
