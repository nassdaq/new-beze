"""Prompt -> Operation[]. Tool calls are collected and schema-validated, never executed here.
The editor applies the batch through @beze/project-core, which enforces referential integrity."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .context import summarize_project
from .prompts import SYSTEM_PROMPT, user_message
from .tools import load_operation_tools, validate_call
from .types import ProviderError, TextProvider, ToolResult, Transcript, Usage


@dataclass
class GenerationOutput:
    operations: list[dict[str, Any]]
    summary: str
    usage: Usage
    iterations: int
    rejected_calls: int = 0
    warnings: list[str] = field(default_factory=list)
    model: str = ""


async def generate_content(
    *,
    provider: TextProvider,
    schemas_dir: Path,
    project: dict[str, Any],
    prompt: str,
    feedback: str | None,
    max_tokens: int,
    max_iterations: int,
) -> GenerationOutput:
    tools = list(load_operation_tools(schemas_dir))
    context_json = json.dumps(summarize_project(project), separators=(",", ":"))
    transcript = Transcript(user_text=user_message(context_json, prompt, feedback))
    operations: list[dict[str, Any]] = []
    usage = Usage()
    rejected = 0
    warnings: list[str] = []
    summary = ""
    model = ""

    for iteration in range(1, max_iterations + 1):
        turn = await provider.complete_with_tools(system=SYSTEM_PROMPT, transcript=transcript, tools=tools, max_tokens=max_tokens)
        usage.add(turn.usage)
        model = turn.model or model
        if turn.text:
            summary = turn.text.strip()
        if turn.stop == "refusal":
            raise ProviderError("the model declined this request")
        results: list[ToolResult] = []
        for call in turn.tool_calls:
            errors = validate_call(schemas_dir, call.name, call.input)
            if errors:
                rejected += 1
                results.append(ToolResult(call_id=call.id, content="Rejected: " + "; ".join(errors), is_error=True))
            else:
                operations.append({"op": call.name, **call.input})
                results.append(ToolResult(call_id=call.id, content="ok"))
        transcript.append(turn, results)
        if turn.stop == "max_tokens":
            warnings.append("the model ran out of output tokens; the result may be incomplete")
            break
        if turn.stop == "end" or not turn.tool_calls:
            break
    else:
        warnings.append(f"stopped after {max_iterations} rounds")

    return GenerationOutput(operations=operations, summary=summary, usage=usage, iterations=len(transcript.turns), rejected_calls=rejected, warnings=warnings, model=model)
