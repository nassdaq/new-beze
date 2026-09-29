from pathlib import Path

from beze_api.ai.tools import load_operation_tools, validate_call

SCHEMAS = Path(__file__).resolve().parents[3] / "schemas"


def test_every_operation_becomes_a_tool():
    tools = load_operation_tools(SCHEMAS)
    names = {t.name for t in tools}
    assert {"createEntity", "paintRect", "setCollisionRect", "createDialogue", "setComponent"} <= names
    for t in tools:
        assert "op" not in t.input_schema["properties"]
        assert t.input_schema.get("additionalProperties") is False


def test_validation_accepts_good_and_rejects_bad_calls():
    assert validate_call(SCHEMAS, "renameProject", {"name": "x"}) == []
    assert validate_call(SCHEMAS, "renameProject", {"nam": "x"})
    assert validate_call(SCHEMAS, "paintRect", {"mapId": "map_a", "layerId": "lyr_a", "x": 0, "y": 0, "width": 3, "height": 2, "gid": 1}) == []
    assert validate_call(SCHEMAS, "paintRect", {"mapId": "map_a", "layerId": "lyr_a", "x": -1, "y": 0, "width": 3, "height": 2, "gid": 1})
    assert validate_call(SCHEMAS, "nope", {})


def test_recursive_action_schema_resolves():
    payload = {"sceneId": "scn_a", "entityId": "ent_a", "component": {"type": "interactable", "action": {"type": "sequence", "actions": [{"type": "setVariable", "variableId": "var_a", "op": "set", "value": True}]}}}
    assert validate_call(SCHEMAS, "setComponent", payload) == []
