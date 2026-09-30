"""Compact, token-bounded summary of a project for the model. Never the full document."""
from __future__ import annotations

from typing import Any


def summarize_project(project: dict[str, Any]) -> dict[str, Any]:
    settings = project.get("settings", {})
    tile = settings.get("tileSize", 32)
    characters = {}
    for c in project.get("characters", {}).values():
        col = c.get("collider", {})
        characters[c["id"]] = {
            "name": c["name"],
            "feetOffset": col.get("offsetY", 0) + col.get("height", 0),
            "hasPortrait": "portraitAssetId" in c,
            "portraitAssetId": c.get("portraitAssetId"),
        }
    tilesets = {}
    for t in project.get("tilesets", {}).values():
        tilesets[t["id"]] = {
            "name": t["name"],
            "tileCount": t["tileCount"],
            "tileTags": {k: v.get("tag", "solid" if v.get("solid") else "") for k, v in t.get("tileProperties", {}).items()},
        }
    maps = {}
    for m in project.get("maps", {}).values():
        gids = []
        for ref in m.get("tilesets", []):
            ts = project.get("tilesets", {}).get(ref["tilesetId"], {})
            props = ts.get("tileProperties", {})
            for local in range(ts.get("tileCount", 0)):
                tag = props.get(str(local), {}).get("tag")
                solid = props.get(str(local), {}).get("solid", False)
                gids.append({"gid": ref["firstGid"] + local, "tag": tag or f"tile{local}", "solid": solid})
        maps[m["id"]] = {
            "name": m["name"],
            "width": m["width"],
            "height": m["height"],
            "layers": [{"id": l["id"], "name": l["name"]} for l in m.get("layers", [])],
            "tiles": gids,
        }
    scenes = {}
    for s in project.get("scenes", {}).values():
        entities = []
        for eid in s.get("entityOrder", []):
            e = s.get("entities", {}).get(eid)
            if not e:
                continue
            sprite = next((c for c in e.get("components", []) if c.get("type") == "sprite"), None)
            entities.append({
                "id": e["id"],
                "name": e["name"],
                "tileX": e["x"] // tile,
                "tileY": e["y"] // tile,
                "characterId": sprite.get("characterId") if sprite else None,
                "components": [c.get("type") for c in e.get("components", [])],
            })
        scenes[s["id"]] = {"name": s["name"], "mapId": s.get("mapId"), "entities": entities}
    dialogues = {d["id"]: {"name": d["name"], "nodes": len(d.get("nodes", {}))} for d in project.get("dialogues", {}).values()}
    variables = {v["id"]: {"name": v["name"], "type": v["type"], "initial": v["initial"]} for v in project.get("variables", {}).values()}
    quests = {q["id"]: {"name": q["name"], "steps": len(q.get("steps", []))} for q in project.get("quests", {}).values()}
    return {
        "name": project.get("name"),
        "tileSize": tile,
        "startSceneId": project.get("startSceneId"),
        "interactKey": settings.get("interactKey"),
        "attackKey": settings.get("attackKey"),
        "abilityKey": settings.get("abilityKey", "X"),
        "characters": characters,
        "tilesets": tilesets,
        "maps": maps,
        "scenes": scenes,
        "dialogues": dialogues,
        "variables": variables,
        "quests": quests,
    }
