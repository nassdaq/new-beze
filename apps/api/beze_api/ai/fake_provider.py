"""Deterministic provider for tests and offline development. Reads the project context out of the
user message and produces a plausible NPC-with-dialogue batch for any prompt."""
from __future__ import annotations

import json
import re
from typing import Any

from .types import ProviderTurn, ToolCall, ToolSpec, Transcript, Usage


class FakeTextProvider:
    name = "fake"

    async def complete_with_tools(
        self, *, system: str, transcript: Transcript, tools: list[ToolSpec], max_tokens: int
    ) -> ProviderTurn:
        if transcript.turns:
            return ProviderTurn(text="Done: I added the character and their dialogue.", tool_calls=[], stop="end", usage=Usage(), payload=[])
        ctx = _context(transcript.user_text)
        prompt = _prompt(transcript.user_text)
        name = _named(prompt) or "Bo"
        slug = re.sub(r"[^a-z0-9]", "", name.lower())[:12] or "npc"
        scene_id = ctx.get("startSceneId") or next(iter(ctx.get("scenes", {})), "scn_x")
        scene = ctx.get("scenes", {}).get(scene_id, {})
        chars = ctx.get("characters", {})
        char_id = next((cid for cid, c in chars.items() if "villager" in c["name"].lower()), next(iter(chars), "chr_x"))
        feet = chars.get(char_id, {}).get("feetOffset", 48)
        tile = ctx.get("tileSize", 32)
        taken = {(e["tileX"], e["tileY"]) for e in scene.get("entities", [])}
        tx, ty = 12, 6
        while (tx, ty) in taken:
            tx += 1
        portrait = chars.get(char_id, {}).get("portraitAssetId")
        line = {"id": f"nod_{slug}_1", "type": "line", "speaker": name, "text": f"Hi, I'm {name}. Welcome to our village.", "next": f"nod_{slug}_end"}
        if portrait:
            line["portraitAssetId"] = portrait
        calls = [
            ToolCall(id="call_1", name="createDialogue", input={"dialogue": {
                "id": f"dlg_{slug}", "name": f"{name} greeting", "startNodeId": f"nod_{slug}_1",
                "nodes": {line["id"]: line, f"nod_{slug}_end": {"id": f"nod_{slug}_end", "type": "end"}},
            }}),
            ToolCall(id="call_2", name="createEntity", input={"sceneId": scene_id, "entity": {
                "id": f"ent_{slug}", "name": name, "x": tx * tile, "y": ty * tile + tile - feet, "facing": "down",
                "components": [
                    {"type": "sprite", "characterId": char_id},
                    {"type": "body", "solid": True},
                    {"type": "interactable", "action": {"type": "startDialogue", "dialogueId": f"dlg_{slug}"}, "prompt": "Talk"},
                ],
            }}),
        ]
        return ProviderTurn(text="", tool_calls=calls, stop="tool_use", usage=Usage(), payload=[])


def _context(user_text: str) -> dict[str, Any]:
    m = re.search(r"Project context \(JSON\):\n(\{.*?\})\n\nRequest:", user_text, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def _prompt(user_text: str) -> str:
    m = re.search(r"Request:\n(.*)", user_text, re.S)
    return m.group(1) if m else user_text


def _named(prompt: str) -> str | None:
    m = re.search(r"\b(?:named|called)\s+([A-Z][A-Za-z]+)", prompt)
    return m.group(1) if m else None
