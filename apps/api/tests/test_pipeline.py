from pathlib import Path

import pytest

from beze_api.ai.content_pipeline import generate_content
from beze_api.ai.context import summarize_project
from beze_api.ai.fake_provider import FakeTextProvider
from beze_api.ai.types import ProviderTurn, ToolCall, Usage

SCHEMAS = Path(__file__).resolve().parents[3] / "schemas"


def test_context_is_compact_and_useful(fixture_project):
    ctx = summarize_project(fixture_project)
    hero = fixture_project["characters"]["chr_hero"]["collider"]
    assert ctx["characters"]["chr_hero"]["feetOffset"] == hero["offsetY"] + hero["height"] == 64
    assert ctx["scenes"]["scn_village"]["entities"][0]["name"] == "Hero"
    assert any(t["tag"] == "tree" and t["solid"] for t in ctx["maps"]["map_village"]["tiles"])
    assert "nodes" not in str(ctx["dialogues"]["dlg_aiko_intro"]) or ctx["dialogues"]["dlg_aiko_intro"]["nodes"] == 8


async def test_fake_provider_produces_a_valid_batch(fixture_project):
    out = await generate_content(provider=FakeTextProvider(), schemas_dir=SCHEMAS, project=fixture_project, prompt="Add an NPC named Bo", feedback=None, max_tokens=1000, max_iterations=4)
    assert [o["op"] for o in out.operations] == ["createDialogue", "createEntity"]
    assert out.operations[1]["entity"]["name"] == "Bo"
    assert out.rejected_calls == 0
    assert out.iterations == 2


class RejectingProvider:
    name = "test"

    def __init__(self):
        self.seen_errors = []

    async def complete_with_tools(self, *, system, transcript, tools, max_tokens):
        if not transcript.turns:
            return ProviderTurn(text="", tool_calls=[ToolCall(id="c1", name="renameProject", input={"nam": "x"})], stop="tool_use", usage=Usage(), payload=[])
        if not self.seen_errors:
            self.seen_errors = [r.content for r in transcript.results[-1] if r.is_error]
        return ProviderTurn(text="ok", tool_calls=[ToolCall(id="c2", name="renameProject", input={"name": "Fixed"})], stop="end", usage=Usage(), payload=[])


async def test_invalid_calls_are_returned_to_the_model_as_errors(fixture_project):
    p = RejectingProvider()
    out = await generate_content(provider=p, schemas_dir=SCHEMAS, project=fixture_project, prompt="rename", feedback=None, max_tokens=100, max_iterations=4)
    assert out.rejected_calls == 1
    assert p.seen_errors and "Rejected" in p.seen_errors[0]
    assert out.operations == [{"op": "renameProject", "name": "Fixed"}]
