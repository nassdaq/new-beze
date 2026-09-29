"""Turns schemas/operations.json (generated from the Zod catalog) into tool specs.

Adding an operation to @beze/project-core adds a tool here with no Python change.
"""
from __future__ import annotations

import copy
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .types import ToolSpec

DESCRIPTIONS: dict[str, str] = {
    "updateSettings": "Change project settings such as title, move speed, interact/attack keys or background colour.",
    "renameProject": "Rename the project.",
    "createCharacter": "Register a new character definition (sprite sheet, animations, collider). Only when a sheet asset already exists.",
    "updateCharacter": "Change a character's name or collider.",
    "deleteCharacter": "Remove a character that no entity uses.",
    "createTileset": "Register a tileset over an existing image asset.",
    "deleteTileset": "Remove an unused tileset.",
    "createMap": "Create a tile map. Layers need width*height gids; prefer createMap with empty-ish layers then paintRect.",
    "deleteMap": "Remove a map that no scene uses.",
    "paintTiles": "Set individual tiles on a layer. gid 0 clears. Use paintRect for areas.",
    "paintRect": "Fill a rectangle of tiles on a layer with one gid (0 clears). The main way to draw maps: ground, paths, ponds, tree lines.",
    "setCollision": "Mark individual tiles solid or walkable.",
    "setCollisionRect": "Mark a rectangle of tiles solid (true) or walkable (false). Solid tiles block the player. Always make trees, water and walls solid.",
    "addLayer": "Add a tile layer to a map (data must have width*height entries).",
    "deleteLayer": "Remove a tile layer.",
    "createScene": "Create a scene (a place). Give it an existing mapId, no entities, and an empty entityOrder; then add entities with createEntity.",
    "updateScene": "Rename a scene or change its map.",
    "deleteScene": "Remove a scene. It must not be the start scene.",
    "setStartScene": "Choose the scene the game starts in.",
    "createEntity": "Place a new entity (player, NPC, enemy, object) in a scene with its components. x/y are world pixels: x = tileX*tileSize, y = tileY*tileSize + tileSize - feetOffset (feetOffset per character is in the context).",
    "placeEntity": "Move an entity to new world-pixel coordinates.",
    "modifyEntity": "Rename an entity or change its facing.",
    "setComponent": "Add or replace one component on an entity: sprite, body, playerControl, interactable (talk -> startDialogue), trigger, wander, health, enemy.",
    "removeComponent": "Remove a component from an entity.",
    "deleteEntity": "Remove an entity from a scene.",
    "createDialogue": "Create a dialogue graph: nodes keyed by id with line, choice, set, branch, action and end nodes. Every next/ifTrue/ifFalse/option.next must be a node id in the same dialogue or null.",
    "updateDialogue": "Rename a dialogue or change its start node.",
    "setDialogueNode": "Add or replace one node in a dialogue.",
    "deleteDialogueNode": "Remove a dialogue node.",
    "deleteDialogue": "Remove a dialogue that no entity uses.",
    "createVariable": "Create a game variable (boolean, number or string) with an initial value. Use variables for flags like metAiko or counters like slimesDefeated.",
    "updateVariable": "Change a variable's name, type or initial value.",
    "deleteVariable": "Remove an unused variable.",
    "createQuest": "Create a quest with steps that complete when variable conditions hold.",
    "updateQuest": "Change a quest.",
    "deleteQuest": "Remove a quest.",
    "registerAsset": "Register asset metadata. Only for assets that already exist in the store; you cannot create images.",
    "unregisterAsset": "Remove an unused asset reference.",
}


@lru_cache(maxsize=4)
def load_operation_tools(schemas_dir: Path) -> tuple[ToolSpec, ...]:
    doc = json.loads((schemas_dir / "operations.json").read_text())
    defs = doc.get("$defs", {})
    specs: list[ToolSpec] = []
    for entry in doc["oneOf"]:
        name = entry["properties"]["op"]["const"]
        schema: dict[str, Any] = copy.deepcopy(entry)
        schema["properties"].pop("op", None)
        schema["required"] = [r for r in schema.get("required", []) if r != "op"]
        schema.setdefault("additionalProperties", False)
        if "$ref" in json.dumps(schema):
            schema["$defs"] = copy.deepcopy(defs)
        specs.append(ToolSpec(name=name, description=DESCRIPTIONS.get(name, f"Operation {name}."), input_schema=schema))
    return tuple(specs)


@lru_cache(maxsize=4)
def validators(schemas_dir: Path) -> dict[str, Draft202012Validator]:
    return {t.name: Draft202012Validator(t.input_schema) for t in load_operation_tools(schemas_dir)}


def validate_call(schemas_dir: Path, name: str, payload: dict[str, Any]) -> list[str]:
    """Returns human-readable validation errors for a tool call (empty when valid)."""
    v = validators(schemas_dir).get(name)
    if v is None:
        return [f"unknown operation {name}"]
    errors = sorted(v.iter_errors(payload), key=lambda e: list(e.path))
    out = []
    for e in errors[:5]:
        path = ".".join(str(p) for p in e.path) or "(root)"
        out.append(f"{path}: {e.message[:200]}")
    return out
