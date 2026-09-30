#!/usr/bin/env python3
"""Generates the "Hacho" template project: a top-down Tanzanian town with missions, money and property.

Reads apps/editor/public/starter/manifest.json (rendered by `pnpm starter`: the Outdoor and City tilesets
with their stamps, and the townsfolk characters) and apps/editor/public/templates/hacho/pack.json (the
player character and its two image assets), lays the town out by hand and writes the same v3 document to

    apps/editor/public/templates/hacho/project.json   (what the editor's "Hacho" template card loads)
    docs/examples/hacho.project.json                  (the fixture the tests validate)

Pure Python 3, no dependencies:

    python3 scripts/generate_hacho.py

Coordinates: tiles are 32 px. An entity's (x, y) is the top-left corner of its sprite frame, so a
character standing on tile (tx, ty) gets y = ty*32 + 32 - (collider.offsetY + collider.height) (its feet on
the tile's bottom edge) and x such that its collider is centred on the tile. Sprite-less entities
(triggers, markers, pickups, property/shop signs, the gate lock) sit on the tile's top-left corner.
`changeScene` spawns use the same top-left convention.

Rules mirrored from @beze/project-core's validateProject (the script asserts them before writing):
every referenced id exists and has the right type, exactly one player per scene, every entity that has
a sprite or a body stands on a walkable cell (sprite-less signs may sit on the solid sign tile they
label), quest step ids are unique, and settings.economy points at number variables. A tag, stamp,
character or asset the art reports promised but the manifest lacks fails loudly with its name.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MANIFEST = os.path.join(ROOT, 'apps', 'editor', 'public', 'starter', 'manifest.json')
PACK = os.path.join(ROOT, 'apps', 'editor', 'public', 'templates', 'hacho', 'pack.json')
OUTPUTS = [
    os.path.join(ROOT, 'apps', 'editor', 'public', 'templates', 'hacho', 'project.json'),
    os.path.join(ROOT, 'docs', 'examples', 'hacho.project.json'),
]

T = 32
NOW = '2026-09-30T00:00:00.000Z'
GENERATOR = 'beze-docs/hacho-0.1'

OUTDOOR, CITY = 'tls_outdoor', 'tls_city'
HERO, VENDOR, BANKER, KID, VILLAGER = 'chr_hacho', 'chr_vendor', 'chr_banker', 'chr_kid', 'chr_villager'
MONEY, XP, REP = 'var_money', 'var_xp', 'var_rep'
TOWN, BANK, RESTAURANT = 'scn_town', 'scn_bank', 'scn_restaurant'

# Every tag the world generator paints. Missing one is a bug in the art, not here: fail with its name.
CITY_TAGS = [
    'road', 'road_line_h', 'road_line_v', 'road_cross', 'crosswalk_h', 'crosswalk_v', 'sidewalk', 'sidewalk_edge_n',
    'sidewalk_edge_s', 'sidewalk_edge_w', 'sidewalk_edge_e', 'sidewalk_corner_nw', 'sidewalk_corner_ne',
    'sidewalk_corner_sw', 'sidewalk_corner_se', 'paving', 'dirt_lot', 'wall', 'wall_window', 'wall_door',
    'wall_shopfront', 'roof', 'roof_edge_n', 'roof_edge_s', 'roof_edge_w', 'roof_edge_e', 'roof_corner_nw',
    'roof_corner_ne', 'roof_corner_sw', 'roof_corner_se', 'roof_red', 'roof_blue', 'sign_shop', 'sign_bank',
    'sign_food', 'sign_bus', 'sign_market', 'sign_forsale', 'sign_park', 'bench', 'lamp', 'trash', 'hydrant', 'hedge',
    'flowerbed', 'fence_city_h', 'fence_city_v', 'gate', 'barrier', 'atm', 'cone', 'floor_wood', 'floor_tile',
    'wall_interior', 'counter', 'table', 'chair', 'shelf', 'vault', 'sidewalk2', 'road2',
]
OUTDOOR_TAGS = ['grass', 'grass2', 'flowers', 'tall_grass', 'flower_red', 'flower_blue', 'bush', 'rock', 'path', 'water',
                'water_edge_n', 'water_edge_s', 'water_edge_w', 'water_edge_e', 'water_corner_nw', 'water_corner_ne',
                'water_corner_sw', 'water_corner_se', 'signpost', 'well', 'bush_berry', 'rock_small', 'pebbles', 'flower_yellow']
STAMPS = {OUTDOOR: ['Tree', 'Pine'], CITY: ['Shop', 'House', 'Bank', 'Restaurant', 'BusShelter', 'StallA', 'StallB', 'Fountain', 'Kiosk']}


def fail(message: str) -> None:
    sys.exit(f'generate_hacho.py: {message}')


# ----------------------------------------------------------------------------------------------------------------
# Tiles and maps


class Tiles:
    """Global tile ids over the ordered tilesets (Outdoor first, so grass is gid 1 as in the starter manifest)."""

    def __init__(self, tilesets: list[dict]):
        self.refs: list[dict] = []
        self.gid_by_tag: dict[str, int] = {}
        self.solid: set[int] = set()
        self.stamps: dict[str, tuple[dict, int]] = {}
        gid = 1
        for t in tilesets:
            self.refs.append({'tilesetId': t['id'], 'firstGid': gid})
            for local, p in t['tileProperties'].items():
                tag = p.get('tag')
                if tag:
                    if tag in self.gid_by_tag:
                        fail(f'tag {tag!r} is carried by two tiles; the generator needs unique tags')
                    self.gid_by_tag[tag] = gid + int(local)
                if p.get('solid'):
                    self.solid.add(gid + int(local))
            for s in t.get('stamps', []):
                self.stamps[s['name']] = (s, gid)
            gid += t['tileCount']
        self.max_gid = gid - 1

    def gid(self, tag: str) -> int:
        if tag not in self.gid_by_tag:
            fail(f'no tile is tagged {tag!r}; re-render the starter art (pnpm starter)')
        return self.gid_by_tag[tag]

    def stamp(self, name: str) -> tuple[dict, int]:
        if name not in self.stamps:
            fail(f'no tileset has a stamp named {name!r}; re-render the starter art (pnpm starter)')
        return self.stamps[name]


class MapBuilder:
    def __init__(self, tiles: Tiles, id_: str, name: str, width: int, height: int, ground_tag: str):
        self.tiles, self.id, self.name, self.w, self.h = tiles, id_, name, width, height
        n = width * height
        self.ground = [tiles.gid(ground_tag)] * n
        self.deco = [0] * n
        self.canopy = [0] * n
        # Cells forced walkable whatever tile they hold (the gate cell the lock entity guards).
        self.open: set[tuple[int, int]] = set()

    def idx(self, x: int, y: int) -> int:
        if not (0 <= x < self.w and 0 <= y < self.h):
            fail(f'map {self.id}: cell ({x}, {y}) is outside {self.w}x{self.h}')
        return y * self.w + x

    def g(self, x: int, y: int, tag: str) -> None:
        self.ground[self.idx(x, y)] = self.tiles.gid(tag)

    def d(self, x: int, y: int, tag: str) -> None:
        i = self.idx(x, y)
        if self.deco[i] != 0:
            fail(f'map {self.id}: decoration cell ({x}, {y}) painted twice ({tag!r})')
        self.deco[i] = self.tiles.gid(tag)

    def rect_g(self, x0: int, y0: int, x1: int, y1: int, tag: str) -> None:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.g(x, y, tag)

    def stamp(self, name: str, ax: int, ay: int) -> None:
        """Paints a stamp with its top-left cell at (ax, ay): `above` cells on Canopy, the rest on Decoration."""
        stamp, first = self.tiles.stamp(name)
        w = stamp['width']
        above = stamp.get('above') or [False] * len(stamp['tiles'])
        for i, local in enumerate(stamp['tiles']):
            if local < 0:
                continue
            x, y = ax + i % w, ay + i // w
            if above[i]:
                self.canopy[self.idx(x, y)] = first + local
            else:
                j = self.idx(x, y)
                if self.deco[j] != 0:
                    fail(f'map {self.id}: stamp {name} at ({ax}, {ay}) overlaps something at ({x}, {y})')
                self.deco[j] = first + local

    def tree(self, x: int, y: int) -> None:
        """A whole tree whose trunk stands on (x, y); the crown goes on the Canopy layer above it."""
        self.stamp('Tree' if (x + y) % 2 == 0 else 'Pine', x, y - 1)

    def solid_at(self, x: int, y: int) -> bool:
        if (x, y) in self.open:
            return False
        i = self.idx(x, y)
        return self.ground[i] in self.tiles.solid or self.deco[i] in self.tiles.solid

    def collision(self) -> list[int]:
        return [1 if self.solid_at(x, y) else 0 for y in range(self.h) for x in range(self.w)]

    def build(self) -> dict:
        short = self.id.split('_', 1)[1]
        layer = lambda suffix, name, data, above: {'id': f'lyr_{short}_{suffix}', 'name': name, 'visible': True, 'aboveEntities': above, 'data': data}
        return {
            'id': self.id, 'name': self.name, 'width': self.w, 'height': self.h, 'tileWidth': T, 'tileHeight': T,
            'tilesets': [dict(r) for r in self.tiles.refs],
            'layers': [layer('ground', 'Ground', self.ground, False), layer('deco', 'Decoration', self.deco, False), layer('canopy', 'Canopy', self.canopy, True)],
            'collision': self.collision(),
        }


def vary(x: int, y: int, plain: str, alt: str, every: int = 7) -> str:
    """Deterministic sprinkling of a variant tile to break repetition."""
    return alt if (x * 3 + y * 5 + (x * y) % 3) % every == 0 else plain


# ----------------------------------------------------------------------------------------------------------------
# Variables, actions, dialogues, quests


class Variables:
    def __init__(self) -> None:
        self.table: dict[str, dict] = {}

    def _add(self, id_: str, name: str, type_: str, initial: Any, label: str, category: str) -> str:
        if id_ in self.table:
            fail(f'variable {id_} declared twice')
        self.table[id_] = {'id': id_, 'name': name, 'type': type_, 'initial': initial, 'label': label, 'category': category}
        return id_

    def stat(self, id_: str, name: str, initial: int, label: str) -> str:
        return self._add(id_, name, 'number', initial, label, 'stat')

    def item(self, id_: str, name: str, label: str) -> str:
        return self._add(id_, name, 'number', 0, label, 'item')

    def flag(self, id_: str, name: str, label: str) -> str:
        return self._add(id_, name, 'boolean', False, label, 'flag')


def cond(var: str, op: str, value: Any) -> dict:
    return {'variableId': var, 'op': op, 'value': value}


def set_var(var: str, value: Any) -> dict:
    return {'type': 'setVariable', 'variableId': var, 'op': 'set', 'value': value}


def add_var(var: str, amount: int) -> dict:
    return {'type': 'setVariable', 'variableId': var, 'op': 'add', 'value': amount}


def notify(text: str, kind: str | None = None) -> dict:
    a: dict = {'type': 'notify', 'text': text}
    if kind:
        a['kind'] = kind
    return a


def seq(*actions: dict) -> dict:
    return {'type': 'sequence', 'actions': list(actions)}


def start_quest(quest_id: str) -> dict:
    return {'type': 'startQuest', 'questId': quest_id}


def play(animation: str) -> dict:
    return {'type': 'playAnimation', 'animation': animation}


def change_scene(scene_id: str, spawn: dict) -> dict:
    return {'type': 'changeScene', 'sceneId': scene_id, 'spawn': spawn}


class DialogueBuilder:
    """Nodes keyed by short names; ids become nod_<dialogue>_<name>."""

    def __init__(self, id_: str, name: str, speaker: str, portrait: str | None):
        self.id, self.name, self.speaker, self.portrait = id_, name, speaker, portrait
        self.nodes: dict[str, dict] = {}
        self.first: str | None = None

    def nid(self, short: str | None) -> str | None:
        return None if short is None else f'nod_{self.id[4:]}_{short}'

    def _put(self, short: str, node: dict) -> str:
        node['id'] = self.nid(short)
        if node['id'] in self.nodes:
            fail(f'dialogue {self.id}: node {short!r} defined twice')
        self.nodes[node['id']] = node
        if self.first is None:
            self.first = node['id']
        return node['id']

    def line(self, short: str, text: str, next_: str | None, speaker: str | None = None) -> str:
        node: dict = {'type': 'line', 'speaker': speaker or self.speaker, 'text': text, 'next': self.nid(next_)}
        if self.portrait and speaker is None:
            node['portraitAssetId'] = self.portrait
        return self._put(short, node)

    def player(self, short: str, text: str, next_: str | None) -> str:
        return self.line(short, text, next_, speaker='Hacho')

    def choice(self, short: str, prompt: str | None, options: list[tuple]) -> str:
        opts = []
        for o in options:
            opt: dict = {'text': o[0], 'next': self.nid(o[1])}
            if len(o) > 2 and o[2] is not None:
                opt['condition'] = o[2]
            opts.append(opt)
        node: dict = {'type': 'choice', 'options': opts}
        if prompt:
            node['prompt'] = prompt
        return self._put(short, node)

    def set(self, short: str, var: str, value: Any, next_: str | None, op: str = 'set') -> str:
        return self._put(short, {'type': 'set', 'variableId': var, 'op': op, 'value': value, 'next': self.nid(next_)})

    def branch(self, short: str, condition: dict, if_true: str | None, if_false: str | None) -> str:
        return self._put(short, {'type': 'branch', 'condition': condition, 'ifTrue': self.nid(if_true), 'ifFalse': self.nid(if_false)})

    def action(self, short: str, action: dict, next_: str | None) -> str:
        return self._put(short, {'type': 'action', 'action': action, 'next': self.nid(next_)})

    def end(self, short: str = 'end') -> str:
        return self._put(short, {'type': 'end'})

    def build(self) -> dict:
        if self.first is None:
            fail(f'dialogue {self.id} has no nodes')
        return {'id': self.id, 'name': self.name, 'startNodeId': self.first, 'nodes': self.nodes}


def quest(id_: str, name: str, description: str, steps: list[tuple[str, str, dict | None]], rewards: list[dict],
          time_limit_ms: int | None = None, on_fail: list[dict] | None = None, repeatable: bool = False) -> dict:
    q: dict = {
        'id': id_, 'name': name, 'description': description,
        'steps': [{'id': f'stp_{id_[4:]}_{sid}', 'text': text, **({'completeWhen': when} if when else {})} for sid, text, when in steps],
        'rewards': rewards,
    }
    if time_limit_ms is not None:
        q['timeLimitMs'] = time_limit_ms
    if on_fail is not None:
        q['onFail'] = on_fail
    if repeatable:
        q['repeatable'] = True
    return q


# ----------------------------------------------------------------------------------------------------------------
# Scenes and entities


class SceneBuilder:
    def __init__(self, id_: str, name: str, map_: MapBuilder, characters: dict[str, dict]):
        self.id, self.name, self.map, self.characters = id_, name, map_, characters
        self.entities: dict[str, dict] = {}
        self.order: list[str] = []

    def _add(self, entity: dict) -> str:
        if entity['id'] in self.entities:
            fail(f'scene {self.id}: entity {entity["id"]} added twice')
        self.entities[entity['id']] = entity
        self.order.append(entity['id'])
        return entity['id']

    def sprite(self, id_: str, name: str, character_id: str, tx: int, ty: int, facing: str, components: list[dict]) -> str:
        """A character standing on tile (tx, ty): feet on the tile's bottom edge, collider centred on it."""
        c = self.characters[character_id]['collider']
        x = tx * T + T // 2 - (c['offsetX'] + c['width'] // 2)
        y = ty * T + T - (c['offsetY'] + c['height'])
        if self.map.solid_at(tx, ty):
            fail(f'scene {self.id}: {id_} stands on a solid cell ({tx}, {ty})')
        return self._add({'id': id_, 'name': name, 'x': x, 'y': y, 'facing': facing,
                          'components': [{'type': 'sprite', 'characterId': character_id}, {'type': 'body', 'solid': True}, *components]})

    def plain(self, id_: str, name: str, tx: int, ty: int, components: list[dict], on_solid: bool = False) -> str:
        """A sprite-less entity on tile (tx, ty). `on_solid` allows it on a solid sign/stall tile it labels."""
        if not on_solid and self.map.solid_at(tx, ty):
            fail(f'scene {self.id}: {id_} sits on a solid cell ({tx}, {ty})')
        return self._add({'id': id_, 'name': name, 'x': tx * T, 'y': ty * T, 'facing': 'down', 'components': components})

    def player(self, tx: int, ty: int, facing: str) -> str:
        return self.sprite(f'ent_{self.id[4:]}_player', 'Hacho', HERO, tx, ty, facing,
                           [{'type': 'playerControl', 'attackDamage': 1}, {'type': 'health', 'max': 3}])

    def npc(self, id_: str, name: str, character_id: str, tx: int, ty: int, facing: str, dialogue_id: str, wander: int | None = None, prompt: str = 'Talk') -> str:
        comps: list[dict] = [{'type': 'interactable', 'action': {'type': 'startDialogue', 'dialogueId': dialogue_id}, 'prompt': prompt}]
        if wander:
            comps.append({'type': 'wander', 'radius': wander, 'speed': 28})
        return self.sprite(id_, name, character_id, tx, ty, facing, comps)

    def trigger(self, id_: str, name: str, tx: int, ty: int, w: int, h: int, action: dict, once: bool) -> str:
        for y in range(ty, ty + h):
            for x in range(tx, tx + w):
                if self.map.solid_at(x, y):
                    fail(f'scene {self.id}: trigger {id_} covers a solid cell ({x}, {y})')
        return self._add({'id': id_, 'name': name, 'x': tx * T, 'y': ty * T, 'facing': 'down',
                          'components': [{'type': 'trigger', 'width': w * T, 'height': h * T, 'onEnter': action, 'once': once}]})

    def pickup(self, id_: str, name: str, tx: int, ty: int, var: str, amount: int) -> str:
        return self.plain(id_, name, tx, ty, [{'type': 'pickup', 'variableId': var, 'amount': amount, 'once': True}])

    def marker(self, id_: str, label: str, icon: str, tx: int, ty: int) -> str:
        return self.plain(id_, label, tx, ty, [{'type': 'mapMarker', 'label': label, 'icon': icon, 'discoverXp': 20}])

    def spawn(self, tx: int, ty: int, facing: str) -> dict:
        """A changeScene spawn for the player on tile (tx, ty) of this scene's map (top-left of the frame)."""
        c = self.characters[HERO]['collider']
        if self.map.solid_at(tx, ty):
            fail(f'scene {self.id}: spawn ({tx}, {ty}) is a solid cell')
        return {'x': tx * T + T // 2 - (c['offsetX'] + c['width'] // 2), 'y': ty * T + T - (c['offsetY'] + c['height']), 'facing': facing}

    def build(self) -> dict:
        return {'id': self.id, 'name': self.name, 'mapId': self.map.id, 'entities': self.entities, 'entityOrder': self.order}


# ----------------------------------------------------------------------------------------------------------------
# The town


def build_town(tiles: Tiles, chars: dict[str, dict], V: Variables, spawns: dict[str, dict]) -> tuple[MapBuilder, SceneBuilder]:
    W, H = 64, 48
    m = MapBuilder(tiles, 'map_town', 'Hacho Town', W, H, 'grass')
    for y in range(H):
        for x in range(W):
            m.g(x, y, vary(x, y, 'grass', 'grass2', 5))

    # --- Roads. The main road (rows 23-25, centre line on 24) runs east-west; the north-south road (cols 31-33,
    # centre line on 32) crosses it at (32, 24). Two-tile sidewalks line every road: the inner tile carries the
    # curb (sidewalk_edge_<side of the road>), the outer tile is plain sidewalk.
    RY0, RY1, RX0, RX1 = 23, 25, 31, 33
    for y in range(RY0, RY1 + 1):
        for x in range(1, W - 1):
            m.g(x, y, 'road_line_h' if y == 24 else vary(x, y, 'road', 'road2', 9))
    for x in range(RX0, RX1 + 1):
        for y in range(2, 46):
            m.g(x, y, 'road_line_v' if x == 32 else vary(x, y, 'road', 'road2', 9))
    for (x, y) in ((31, 23), (33, 23), (31, 25), (33, 25)):
        m.g(x, y, 'road')
    m.g(31, 24, 'road_line_h'); m.g(33, 24, 'road_line_h'); m.g(32, 23, 'road_line_v'); m.g(32, 25, 'road_line_v')
    m.g(32, 24, 'road_cross')
    # Sidewalk bands along the main road (rows 21-22 north, 26-27 south) and the crossing road (cols 29-30, 34-35).
    for x in range(1, W - 1):
        if RX0 <= x <= RX1:
            continue
        m.g(x, 21, vary(x, 21, 'sidewalk', 'sidewalk2')); m.g(x, 22, 'sidewalk_edge_s')
        m.g(x, 26, 'sidewalk_edge_n'); m.g(x, 27, vary(x, 27, 'sidewalk', 'sidewalk2'))
    for y in list(range(2, 21)) + list(range(28, 46)):
        m.g(29, y, vary(29, y, 'sidewalk', 'sidewalk2')); m.g(30, y, 'sidewalk_edge_e')
        m.g(34, y, 'sidewalk_edge_w'); m.g(35, y, vary(35, y, 'sidewalk', 'sidewalk2'))
    # Outer corners of the four junction blocks.
    m.g(30, 22, 'sidewalk_corner_se'); m.g(34, 22, 'sidewalk_corner_sw'); m.g(30, 26, 'sidewalk_corner_ne'); m.g(34, 26, 'sidewalk_corner_nw')
    # Crosswalks hug the junction: across the main road on cols 30/34, across the north-south road on rows 22/26.
    for y in range(RY0, RY1 + 1):
        m.g(30, y, 'crosswalk_v'); m.g(34, y, 'crosswalk_v')
    for x in range(RX0, RX1 + 1):
        m.g(x, 22, 'crosswalk_h'); m.g(x, 26, 'crosswalk_h')

    # --- Uptown's entrance road: a short spur north from the main road at cols 55-57, gated on row 18.
    for y in range(19, 23):
        for x in range(55, 58):
            m.g(x, y, 'road_line_v' if (x == 56 and y < 22) else 'crosswalk_h' if y == 22 else 'road')
    for y in range(19, 21):
        m.g(54, y, 'sidewalk_edge_e'); m.g(58, y, 'sidewalk_edge_w')
    m.g(54, 21, 'sidewalk_edge_e'); m.g(54, 22, 'sidewalk_corner_se'); m.g(58, 21, 'sidewalk_edge_w'); m.g(58, 22, 'sidewalk_corner_sw')

    # --- Tree border (crowns on row 0 / the Canopy layer, trunks on row 1, row 47, col 0 and col 63).
    for x in range(W):
        m.tree(x, 1); m.tree(x, H - 1)
    for y in range(2, H - 1):
        m.tree(0, y); m.tree(W - 1, y)
    # The roads run into the trees at the map edge: end them cleanly with a barrier.
    for (x, y) in ((1, 23), (1, 24), (1, 25), (62, 23), (62, 24), (62, 25), (31, 45), (32, 45), (33, 45), (31, 2), (32, 2), (33, 2)):
        m.d(x, y, 'barrier')

    # --- Bus station (west end of the main road, north side): paved apron, shelter, bench, sign.
    m.rect_g(2, 18, 8, 20, 'paving')
    m.d(2, 20, 'bench'); m.stamp('BusShelter', 3, 19); m.d(7, 20, 'sign_bus'); m.d(8, 20, 'trash'); m.d(2, 18, 'lamp')

    # --- Shops along the main road (north side, doors on row 20 facing the sidewalk).
    m.stamp('Shop', 9, 18)          # Duka la Asha, door (10, 20)
    m.stamp('Kiosk', 13, 19)        # door (14, 20)
    m.stamp('Shop', 16, 18)         # the Small Shop for sale, door (17, 20)
    m.d(8, 21, 'sign_shop'); m.d(18, 21, 'sign_forsale'); m.d(15, 21, 'lamp'); m.d(21, 21, 'trash'); m.d(15, 18, 'hedge'); m.d(19, 18, 'hedge'); m.d(20, 20, 'hydrant')

    # --- Market square north of the shops, opening east onto the crossing road's sidewalk.
    m.rect_g(18, 6, 28, 16, 'paving')
    for (x, y, name) in ((18, 7, 'StallA'), (21, 7, 'StallB'), (24, 7, 'StallA'), (27, 7, 'StallB'), (18, 13, 'StallB'), (21, 13, 'StallA'), (24, 13, 'StallB')):
        m.stamp(name, x, y)
    m.stamp('Fountain', 22, 10)
    m.d(28, 6, 'sign_market'); m.d(28, 16, 'lamp'); m.d(18, 16, 'trash'); m.d(20, 10, 'bench'); m.d(20, 11, 'bench'); m.d(26, 10, 'flowerbed'); m.d(26, 11, 'flowerbed')
    m.d(17, 6, 'hedge'); m.d(17, 7, 'hedge'); m.d(17, 15, 'hedge'); m.d(17, 16, 'hedge'); m.d(28, 5, 'hedge'); m.d(18, 5, 'hedge')

    # --- North-west meadow: a dirt lot with a well, some trees and flowers.
    m.rect_g(4, 9, 10, 13, 'dirt_lot')
    m.d(7, 11, 'well'); m.d(4, 13, 'cone'); m.d(10, 9, 'cone'); m.d(11, 13, 'signpost')
    for y in range(14, 18):
        m.g(7, y, 'path')
    for (x, y) in ((3, 4), (7, 5), (12, 4), (14, 9), (3, 16), (13, 15), (9, 16), (16, 4)):
        m.tree(x, y)
    for (x, y, tag) in ((5, 6, 'flowers'), (10, 6, 'flower_red'), (14, 12, 'bush'), (2, 12, 'rock'), (12, 7, 'flower_blue'), (6, 15, 'bush_berry'), (24, 3, 'tall_grass'), (20, 3, 'flowers')):
        m.d(x, y, tag)

    # --- Bank and restaurant east of the junction (north side, doors on row 20).
    m.stamp('Bank', 36, 18)         # door (37, 20)
    m.d(40, 20, 'atm')
    m.stamp('Restaurant', 42, 18)   # door (43, 20)
    m.d(39, 21, 'sign_bank'); m.d(45, 21, 'sign_food'); m.d(42, 21, 'sign_forsale'); m.d(41, 20, 'trash'); m.d(47, 21, 'lamp'); m.d(46, 20, 'hedge'); m.d(47, 20, 'hedge'); m.d(48, 20, 'bench')

    # --- Park (north-east): a path, trees, flower beds, benches, hedge along the south side.
    for x in range(36, 49):
        m.d(x, 17, 'hedge')
    for x in range(36, 47):
        m.g(x, 10, 'path')
    for (x, y) in ((37, 4), (40, 3), (44, 4), (47, 5), (38, 14), (46, 16), (48, 12), (43, 7), (41, 15)):
        m.tree(x, y)
    for (x, y) in ((39, 8), (45, 8), (39, 12), (45, 12), (42, 5)):
        m.d(x, y, 'flowerbed')
    m.d(38, 9, 'bench'); m.d(44, 9, 'bench'); m.d(41, 9, 'lamp'); m.d(36, 8, 'sign_park'); m.d(36, 13, 'trash'); m.d(47, 11, 'bench')
    m.d(40, 13, 'flowers'); m.d(44, 14, 'flower_yellow'); m.d(37, 6, 'bush'); m.d(47, 8, 'rock_small')

    # --- Uptown (far north-east): fenced, gated at (55-57, 18), a big business behind a paved plaza.
    for y in range(3, 18):
        m.d(49, y, 'fence_city_v')
    for x in range(49, 63):
        if 55 <= x <= 57:
            m.d(x, 18, 'gate')
        else:
            m.d(x, 18, 'fence_city_h')
    m.open.add((56, 18))  # the lock entity guards the middle gate cell; the outer two stay solid
    m.rect_g(50, 12, 62, 17, 'paving')
    BX, BY = 52, 6  # 8x6 building: three roof rows, three wall rows, door at (56, 11)
    roof = [['roof_corner_nw'] + ['roof_edge_n'] * 6 + ['roof_corner_ne'],
            ['roof_edge_w'] + ['roof'] * 6 + ['roof_edge_e'],
            ['roof_corner_sw'] + ['roof_edge_s'] * 6 + ['roof_corner_se'],
            ['wall_window', 'wall', 'wall_window', 'wall', 'wall', 'wall_window', 'wall', 'wall_window'],
            ['wall', 'wall_window', 'wall', 'wall_window', 'wall_window', 'wall', 'wall_window', 'wall'],
            ['wall_shopfront', 'wall_shopfront', 'wall_shopfront', 'wall_shopfront', 'wall_door', 'wall_shopfront', 'wall_shopfront', 'wall_shopfront']]
    for j, row in enumerate(roof):
        for i, tag in enumerate(row):
            m.d(BX + i, BY + j, tag)
    m.d(57, 12, 'sign_forsale'); m.stamp('Fountain', 52, 14); m.d(51, 13, 'lamp'); m.d(61, 13, 'lamp'); m.d(60, 15, 'bench'); m.d(60, 16, 'bench'); m.d(55, 16, 'flowerbed'); m.d(58, 16, 'flowerbed')
    for (x, y) in ((51, 4), (61, 4), (50, 9), (61, 9)):
        m.tree(x, y)
    m.d(53, 4, 'bush'); m.d(59, 4, 'flowers')
    for y in (9, 10, 11):
        m.d(51, y, 'hedge'); m.d(60, y, 'hedge')
    m.d(50, 13, 'flowerbed'); m.d(62, 13, 'flowerbed'); m.d(50, 16, 'flowerbed'); m.d(62, 16, 'flowerbed'); m.d(56, 13, 'trash')

    # --- Residential area (south-east): two rows of houses on paved lanes inside a fence.
    m.rect_g(38, 28, 39, 39, 'paving')
    m.rect_g(38, 33, 55, 34, 'paving'); m.rect_g(38, 38, 55, 39, 'paving')
    for x in range(37, 57):
        if x not in (38, 39):
            m.d(x, 29, 'fence_city_h')
        m.d(x, 40, 'fence_city_h')
    for y in range(30, 40):
        m.d(37, y, 'fence_city_v'); m.d(56, y, 'fence_city_v')
    for (x, y) in ((41, 30), (46, 30), (51, 30), (41, 35), (46, 35), (51, 35)):
        m.stamp('House', x, y)      # doors at (x+1, y+2)
    for (x, y) in ((44, 31), (45, 31), (49, 31), (50, 31), (44, 36), (45, 36), (49, 36), (50, 36)):
        m.d(x, y, 'hedge')
    for (x, y) in ((44, 32), (45, 32), (49, 32), (50, 32), (44, 37), (45, 37), (49, 37), (50, 37)):
        m.d(x, y, 'flowerbed')
    m.d(48, 33, 'sign_forsale'); m.d(40, 33, 'lamp'); m.d(55, 33, 'trash'); m.d(55, 38, 'lamp'); m.d(40, 38, 'bench'); m.d(54, 31, 'hydrant')
    m.tree(55, 30); m.tree(55, 36); m.tree(59, 31); m.tree(60, 37); m.tree(58, 43); m.tree(42, 43); m.tree(50, 44)
    m.d(58, 34, 'flowers'); m.d(45, 42, 'bush'); m.d(52, 42, 'rock')

    # --- South-west: the player's start, a small plaza where Mzee Hamisi hands out advice, a pond, trees.
    m.rect_g(4, 29, 11, 33, 'paving')
    m.d(4, 29, 'lamp'); m.d(6, 29, 'bench'); m.d(9, 29, 'bench'); m.d(11, 29, 'trash'); m.d(10, 33, 'well'); m.d(5, 33, 'signpost')
    PX, PY = 17, 36  # 3x2 pond with shore tiles
    for y in range(PY, PY + 2):
        for x in range(PX, PX + 3):
            v = 'n' if y == PY else 's'
            h = 'w' if x == PX else 'e' if x == PX + 2 else ''
            m.d(x, y, f'water_corner_{v}{h}' if h else f'water_edge_{v}')
    m.d(16, 37, 'pebbles'); m.d(20, 36, 'rock_small'); m.d(21, 38, 'flower_blue')
    m.rect_g(12, 40, 21, 44, 'dirt_lot')  # a football pitch marked out with cones
    for (x, y) in ((12, 40), (21, 40), (12, 44), (21, 44), (12, 42), (21, 42)):
        m.d(x, y, 'cone')
    m.d(16, 39, 'bench'); m.d(18, 39, 'bench'); m.d(22, 41, 'trash')
    for x in range(12, 17):
        m.g(x, 31, 'path')
    for y in range(31, 36):
        m.g(16, y, 'path')
    for (x, y) in ((3, 36), (14, 33), (22, 30), (26, 42), (8, 40), (24, 43), (24, 36), (5, 44), (27, 31), (9, 44), (2, 31)):
        m.tree(x, y)
    for (x, y, tag) in ((12, 36, 'flowers'), (25, 39, 'bush'), (3, 41, 'rock'), (10, 37, 'flower_red'), (23, 33, 'bush_berry'), (13, 28, 'flowers')):
        m.d(x, y, tag)

    # ---------------------------------------------------------------------------------------------- entities
    s = SceneBuilder(TOWN, 'Hacho Town', m, chars)
    START = (6, 27)
    s.player(*START, 'right')
    s.trigger('ent_town_welcome', 'Welcome trigger', START[0], START[1], 1, 1, start_quest('qst_welcome'), once=True)

    # Places: a map marker (the runtime awards discoverXp and shows "Discovered: ..." when the player comes within
    # 48 px of it) and an entrance trigger that records the discovered_<place> flag the quests read.
    def place(key: str, label: str, icon: str, marker_at: tuple[int, int], *zones: tuple[int, int, int, int]) -> None:
        flag = V.flag(f'var_discovered_{key}', f'discovered_{key}', f'Discovered {label}')
        s.marker(f'ent_town_marker_{key}', label, icon, *marker_at)
        for i, (tx, ty, w, h) in enumerate(zones):
            s.trigger(f'ent_town_enter_{key}{"" if i == 0 else i + 1}', f'Enter {label}', tx, ty, w, h, set_var(flag, True), once=True)

    place('bus', 'Bus Station', 'bus', (4, 21), (3, 21, 3, 1))
    place('shop', 'Duka la Asha', 'shop', (10, 21), (9, 21, 3, 1))
    place('market', 'Market', 'market', (28, 11), (28, 9, 1, 6), (19, 16, 9, 1))
    place('bank', 'Bank', 'bank', (37, 21), (36, 21, 3, 1))
    place('restaurant', 'Mama Ntilie', 'food', (43, 21), (43, 21, 2, 1))
    place('park', 'Park', 'park', (36, 10), (36, 9, 1, 4))
    place('residential', 'Residential', 'home', (38, 30), (38, 29, 2, 1))
    place('uptown', 'Uptown', 'place', (56, 17), (55, 17, 3, 1))

    # Doors into the interiors (once false: every visit).
    s.trigger('ent_town_door_bank', 'Bank door', 37, 20, 1, 1, change_scene(BANK, spawns[BANK]), once=False)
    s.trigger('ent_town_door_restaurant', 'Restaurant door', 43, 20, 1, 1, change_scene(RESTAURANT, spawns[RESTAURANT]), once=False)

    # NPCs.
    s.npc('ent_town_neema', 'Mama Neema', VENDOR, 25, 11, 'left', 'dlg_neema', wander=16)
    s.npc('ent_town_asha', 'Asha', VENDOR, 12, 21, 'down', 'dlg_asha')
    s.npc('ent_town_baraka', 'Baraka', KID, 42, 12, 'down', 'dlg_baraka', wander=48)
    s.npc('ent_town_kombo', 'Mzee Kombo', BANKER, 6, 20, 'down', 'dlg_kombo')
    s.npc('ent_town_hamisi', 'Mzee Hamisi', VILLAGER, 7, 31, 'down', 'dlg_hamisi', wander=24)
    s.npc('ent_town_zawadi', 'Bibi Zawadi', VILLAGER, 43, 34, 'left', 'dlg_zawadi', wander=48)

    # Shops: the shop entity sits on the door (or stall) cell the player faces to trade.
    s.plain('ent_town_shop_asha', 'Duka la Asha', 10, 20, [{'type': 'shop', 'name': 'Duka la Asha', 'sells': [
        {'variableId': 'var_phone_credit', 'price': 2000}, {'variableId': 'var_tomatoes', 'price': 1500}], 'buys': []}])
    s.plain('ent_town_shop_kiosk', 'Kiosk', 14, 20, [{'type': 'shop', 'name': 'Kiosk ya Mjomba', 'sells': [
        {'variableId': 'var_snacks', 'price': 1000}], 'buys': []}])
    s.plain('ent_town_shop_stall', 'Market stall', 21, 14, [{'type': 'shop', 'name': 'Market Stall', 'sells': [],
        'buys': [{'variableId': 'var_tomatoes', 'price': 2500}]}], on_solid=True)

    # Properties: the entity sits on the sign_forsale tile beside the door.
    def prop(id_: str, tx: int, ty: int, name: str, price: int, income: int, owned: str, description: str) -> None:
        s.plain(id_, name, tx, ty, [{'type': 'property', 'name': name, 'price': price, 'incomePerDay': income,
                                     'ownedVariableId': owned, 'description': description}], on_solid=True)

    prop('ent_town_prop_shop', 18, 21, 'Small Shop', 250_000, 8_000, 'var_own_shop', 'A corner shop on the main road. Pays TSh 8,000 a day.')
    prop('ent_town_prop_restaurant', 42, 21, 'Restaurant', 750_000, 25_000, 'var_own_restaurant', "Mama Ntilie's place. Pays TSh 25,000 a day.")
    prop('ent_town_prop_house', 48, 33, 'House', 400_000, 12_000, 'var_own_house', 'A tidy family house to rent out. Pays TSh 12,000 a day.')
    prop('ent_town_prop_business', 57, 12, 'Large Business', 2_500_000, 90_000, 'var_own_business', 'The Uptown trading house. Pays TSh 90,000 a day.')

    # The Uptown gate: locked until reputation reaches 3; a trigger before it hands out the quest that says so.
    s.plain('ent_town_gate_lock', 'Uptown gate', 56, 18, [{'type': 'lock', 'condition': cond(REP, 'gte', 3),
        'lockedText': 'The Uptown gate is chained. The guard wants 3 reputation stars first.'}])
    s.trigger('ent_town_gate_quest', 'Uptown gate approach', 55, 19, 3, 1, start_quest('qst_uptown'), once=True)

    # Small interactive objects.
    s.plain('ent_town_atm', 'ATM', 40, 20, [{'type': 'interactable', 'prompt': 'Use ATM',
        'action': notify('ATM: "Huduma haipatikani" - out of service. Try Mr. Juma inside.', 'warning')}], on_solid=True)
    s.plain('ent_town_timetable', 'Bus timetable', 4, 20, [{'type': 'interactable', 'prompt': 'Read',
        'action': notify('Next bus to Uptown: as soon as the gate opens.')}], on_solid=True)
    s.plain('ent_town_fountain', 'Fountain', 22, 11, [{'type': 'interactable', 'prompt': 'Look',
        'action': seq(notify('You watch the water for a moment. Pole pole.'), play('phone'))}], on_solid=True)
    s.plain('ent_town_signpost', 'Signpost', 5, 33, [{'type': 'interactable', 'prompt': 'Read',
        'action': notify('Market: north of the junction. Bank and Mama Ntilie: east. Park: north-east.')}], on_solid=True)

    # Collectibles: coins along the sidewalks and in the park, the lost parcel behind a market stall, the ball.
    coins = [(9, 27), (24, 21), (26, 27), (30, 8), (34, 40), (40, 27), (48, 21), (60, 27), (40, 6), (47, 9), (37, 15), (54, 33)]
    for i, (x, y) in enumerate(coins):
        s.pickup(f'ent_town_coin_{i + 1}', 'Coins', x, y, MONEY, 500)
    s.pickup('ent_town_parcel', 'Lost parcel', 22, 6, 'var_parcel', 1)
    s.pickup('ent_town_ball', 'Football', 47, 15, 'var_ball', 1)
    return m, s


# ----------------------------------------------------------------------------------------------------------------
# Interiors


def build_interior(tiles: Tiles, chars: dict[str, dict], id_: str, name: str, w: int, h: int, floor: str, exit_x: int) -> tuple[MapBuilder, SceneBuilder]:
    """A walled room; the exit is the gap in the bottom wall at (exit_x, h-1)."""
    m = MapBuilder(tiles, f'map_{id_[4:]}', name, w, h, floor)
    for x in range(w):
        m.d(x, 0, 'wall_interior')
        if x != exit_x:
            m.d(x, h - 1, 'wall_interior')
    for y in range(1, h - 1):
        m.d(0, y, 'wall_interior'); m.d(w - 1, y, 'wall_interior')
    return m, SceneBuilder(id_, name, m, chars)


def build_bank(tiles: Tiles, chars: dict[str, dict], town_spawn: dict) -> tuple[MapBuilder, SceneBuilder]:
    m, s = build_interior(tiles, chars, BANK, 'Bank', 10, 8, 'floor_tile', 5)
    for x in range(1, 9):
        if x != 4:
            m.d(x, 3, 'counter')  # Mr. Juma stands in the gap at (4, 3)
    m.d(8, 1, 'vault'); m.d(1, 1, 'shelf'); m.d(2, 1, 'shelf'); m.d(6, 1, 'shelf'); m.d(7, 1, 'shelf')
    m.d(1, 5, 'chair'); m.d(8, 5, 'chair')
    s.player(5, 5, 'up')
    s.npc('ent_bank_juma', 'Mr. Juma', BANKER, 4, 3, 'down', 'dlg_juma')
    s.trigger('ent_bank_exit', 'Exit', 5, 7, 1, 1, change_scene(TOWN, town_spawn), once=False)
    return m, s


def build_restaurant(tiles: Tiles, chars: dict[str, dict], town_spawn: dict) -> tuple[MapBuilder, SceneBuilder]:
    m, s = build_interior(tiles, chars, RESTAURANT, 'Mama Ntilie', 12, 8, 'floor_wood', 6)
    for x in range(1, 11):
        if x != 5:
            m.d(x, 2, 'counter')  # Mama Ntilie stands in the gap at (5, 2)
    for x in (2, 3, 8, 9):
        m.d(x, 1, 'shelf')
    for (x, y) in ((2, 4), (9, 4), (2, 5), (9, 5)):
        m.d(x, y, 'table')
    for (x, y) in ((1, 4), (3, 4), (8, 4), (10, 4), (1, 5), (3, 5), (8, 5), (10, 5)):
        m.d(x, y, 'chair')
    s.player(6, 5, 'up')
    s.npc('ent_restaurant_ntilie', 'Mama Ntilie', VENDOR, 5, 2, 'down', 'dlg_ntilie')
    s.trigger('ent_restaurant_exit', 'Exit', 6, 7, 1, 1, change_scene(TOWN, town_spawn), once=False)
    return m, s


# ----------------------------------------------------------------------------------------------------------------
# Dialogues and quests


def build_dialogues(portraits: dict[str, str | None]) -> dict[str, dict]:
    out: dict[str, dict] = {}

    # Mama Neema: the welcome, then the Lost Package mission.
    d = DialogueBuilder('dlg_neema', 'Mama Neema', 'Mama Neema', portraits[VENDOR])
    d.branch('started', cond('var_lostpkg_started', 'eq', True), 'returned', 'met')
    d.branch('returned', cond('var_parcel_returned', 'eq', True), 'hero', 'holding')
    d.line('hero', 'Shujaa wangu! The parcel got to my sister in Dodoma. If you ever have tomatoes to sell, my stall pays well.', 'end')
    d.branch('holding', cond('var_parcel', 'gte', 1), 'found', 'looking')
    d.line('found', 'Eeh! That is it, my parcel! Asante sana, asante! Here, let me take it before it walks off again.', 'take')
    d.set('take', 'var_parcel', -1, 'take2', op='add')
    d.set('take2', 'var_parcel_returned', True, 'thanks')
    d.line('thanks', 'You are good people. Everybody in Hacho will hear about this.', 'end')
    d.line('looking', 'Still no parcel? Pole. Look BEHIND the stalls, up by the hedge. Small brown box, my name on it.', 'end')
    d.branch('met', cond('var_met_neema', 'eq', True), 'again', 'hello')
    d.line('hello', 'Karibu Hacho! You must be the new one. I am Mama Neema; I have sold tomatoes on this square since before the fountain worked.', 'meet')
    d.set('meet', 'var_met_neema', True, 'hello2')
    d.line('hello2', 'Everyone here will want something from you, mostly errands. Pole pole, one thing at a time.', 'choice')
    d.line('again', 'Habari! Back again? The tomatoes are still red and I am still busy.', 'choice')
    d.choice('choice', 'What do you say?', [
        ('Need any help, Mama?', 'help'),
        ('Tell me about Hacho.', 'town'),
        ('Just saying hi.', 'bye'),
    ])
    d.action('help', start_quest('qst_lost_package'), 'help_flag')
    d.set('help_flag', 'var_lostpkg_started', True, 'help2')
    d.line('help2', 'Yes! A parcel for my sister went missing somewhere in this market. A porter dropped it, I think. Find it and I will pay you properly.', 'end')
    d.line('town', 'The bank and Mama Ntilie are east of the junction. Asha runs the shop down the road. And the kid in the park loses things every single day.', 'end')
    d.line('bye', 'Haya, safari njema. Mind the piki-pikis.', 'end')
    d.end()
    out[d.id] = d.build()

    # Asha: shopkeeper, Quick Delivery (repeatable, timed).
    d = DialogueBuilder('dlg_asha', 'Asha', 'Asha', portraits[VENDOR])
    d.branch('carrying', cond('var_delivery', 'gte', 1), 'hurry', 'met')
    d.line('hurry', 'Why are you still here? Mama Ntilie is waiting, east past the junction, blue roof. Haraka!', 'end')
    d.branch('met', cond('var_met_asha', 'eq', True), 'again', 'hello')
    d.line('hello', 'Karibu, Duka la Asha! Phone credit, tomatoes, and opinions, all fresh. Press E at my door if you want to buy.', 'meet')
    d.set('meet', 'var_met_asha', True, 'choice')
    d.line('again', 'Mambo! Buying, or running errands today?', 'choice')
    d.choice('choice', None, [
        ('Any deliveries?', 'job'),
        ('What do you sell?', 'sell'),
        ('Just looking.', 'bye'),
    ])
    d.action('job', seq(set_var('var_delivered', False), set_var('var_delivery', 1), start_quest('qst_quick_delivery')), 'job2')
    d.line('job2', 'Perfect timing. This order goes to Mama Ntilie at the restaurant. She wants it in ninety seconds or she cancels. Today pole pole is NOT the plan!', 'end')
    d.line('sell', 'Phone credit for TSh 2,000, tomatoes for TSh 1,500. Between you and me, the market stall pays more for tomatoes than I charge. Do not tell Mama Neema I said so.', 'end')
    d.line('bye', 'Haya. Come back when your pockets are heavier.', 'end')
    d.end()
    out[d.id] = d.build()

    # Baraka: the lost football.
    d = DialogueBuilder('dlg_baraka', 'Baraka', 'Baraka', portraits[KID])
    d.branch('done', cond('var_ball_returned', 'eq', True), 'play', 'started')
    d.line('play', 'Simba forever! When I am famous I will buy you a whole shop. Two shops!', 'end')
    d.branch('started', cond('var_ball_started', 'eq', True), 'holding', 'met')
    d.branch('holding', cond('var_ball', 'gte', 1), 'found', 'looking')
    d.line('found', 'MY BALL! Asante, asante, asante! I promise I will kick it in the OTHER direction now.', 'take')
    d.set('take', 'var_ball', -1, 'take2', op='add')
    d.set('take2', 'var_ball_returned', True, 'end')
    d.line('looking', 'Did you look near the big trees at the back of the park? It rolled that way. Probably. Maybe.', 'end')
    d.branch('met', cond('var_met_baraka', 'eq', True), 'again', 'hello')
    d.line('hello', 'Shikamoo! I am Baraka, number 7, future Taifa Stars striker. Are you good at finding things?', 'meet')
    d.set('meet', 'var_met_baraka', True, 'choice')
    d.line('again', 'You again! Still good at finding things?', 'choice')
    d.choice('choice', None, [
        ("What's wrong?", 'job'),
        ('Nice shirt.', 'shirt'),
    ])
    d.action('job', start_quest('qst_ball'), 'job_flag')
    d.set('job_flag', 'var_ball_started', True, 'job2')
    d.line('job2', 'I kicked my ball too hard and now it is gone. Somewhere in the park. Mama will shout if I come home without it.', 'end')
    d.line('shirt', 'Number 7! Like the best player in the whole world. Also it was the only one left at the market.', 'end')
    d.end()
    out[d.id] = d.build()

    # Mzee Kombo, the bus attendant.
    d = DialogueBuilder('dlg_kombo', 'Mzee Kombo', 'Mzee Kombo', portraits[BANKER])
    d.branch('met', cond('var_met_kombo', 'eq', True), 'again', 'hello')
    d.line('hello', 'Karibu, karibu. Mzee Kombo, bus station master, timetable expert, tea drinker. No bus right now, so sit if you like.', 'meet')
    d.set('meet', 'var_met_kombo', True, 'choice')
    d.line('again', 'Habari za leo? Still no bus. There is always tea.', 'choice')
    d.choice('choice', None, [
        ('Where do the buses go?', 'where'),
        ("What's behind that gate to the north-east?", 'uptown'),
        ('Asante, Mzee.', 'bye'),
    ])
    d.line('where', 'Dar es Salaam, Arusha, Dodoma... and one goes to Uptown, past the big gate. When the gate is open, that is.', 'end')
    d.line('uptown', 'Uptown. Big houses, a trading house for sale, people who say "hello" in English. The guard only lets in people the town trusts. Three stars of reputation, he says.', 'end')
    d.line('bye', 'Safari njema. Mind the road.', 'end')
    d.end()
    out[d.id] = d.build()

    # Mr. Juma, the banker (inside the bank).
    d = DialogueBuilder('dlg_juma', 'Mr. Juma', 'Mr. Juma', portraits[BANKER])
    d.branch('owner', cond('var_own_shop', 'eq', True), 'congrats', 'met')
    d.action('congrats', start_quest('qst_first_property'), 'congrats2')
    d.line('congrats2', 'A property owner! I knew it. Income arrives every morning. Next: the restaurant, the house, and one day, Uptown.', 'end')
    d.branch('met', cond('var_met_juma', 'eq', True), 'again', 'hello')
    d.line('hello', 'Karibu, Hacho Community Bank. Mr. Juma, manager. We do savings, loans, and free advice. The advice is the best product.', 'meet')
    d.set('meet', 'var_met_juma', True, 'choice')
    d.line('again', 'Ah, my favourite customer. Advice today?', 'choice')
    d.choice('choice', None, [
        ('How do I get ahead in this town?', 'advice'),
        ('What about Uptown?', 'uptown'),
        ('Just visiting.', 'bye'),
    ])
    d.action('advice', start_quest('qst_first_property'), 'advice2')
    d.line('advice2', 'Property. A small shop on the main road is for sale for TSh 250,000. Buy it and it pays TSh 8,000 every day, while you sleep. Missions and coins get you there.', 'end')
    d.line('uptown', 'Reputation. Return what people lose, run their errands, open a business. Three stars and the gate guard becomes very polite.', 'end')
    d.line('bye', 'Karibu tena. The ATM outside is, as always, out of service.', 'end')
    d.end()
    out[d.id] = d.build()

    # Mama Ntilie, the cook (inside the restaurant): takes Asha's order.
    d = DialogueBuilder('dlg_ntilie', 'Mama Ntilie', 'Mama Ntilie', portraits[VENDOR])
    d.branch('order', cond('var_delivery', 'gte', 1), 'got', 'met')
    d.line('got', "Ah, Asha's order! Still warm, still on time. Asante, mwanangu. Sit, have some chai, you have earned it.", 'got_take')
    d.set('got_take', 'var_delivery', 0, 'got_flag')
    d.set('got_flag', 'var_delivered', True, 'end')
    d.branch('met', cond('var_met_ntilie', 'eq', True), 'again', 'hello')
    d.line('hello', 'Karibu, karibu! Wali maharage, chipsi mayai, chai ya tangawizi. Everything is ready, nothing is fast. That is the secret.', 'meet')
    d.set('meet', 'var_met_ntilie', True, 'end')
    d.line('again', 'Habari! Hungry, or delivering? Asha sends her orders with whoever walks past.', 'end')
    d.end()
    out[d.id] = d.build()

    # Mzee Hamisi: mission hints on the south-west plaza.
    d = DialogueBuilder('dlg_hamisi', 'Mzee Hamisi', 'Mzee Hamisi', portraits[VILLAGER])
    d.branch('met', cond('var_met_hamisi', 'eq', True), 'again', 'hello')
    d.line('hello', 'Shikamoo... no wait, I am the elder, YOU say shikamoo. Ha! Karibu. I am Hamisi. I sit here and know things.', 'meet')
    d.set('meet', 'var_met_hamisi', True, 'tip')
    d.line('again', 'Marahaba. Still walking, still learning?', 'tip')
    d.line('tip', 'Looking for work? Mama Neema at the market always needs a hand. Asha does deliveries. The kid in the park loses things. And Mr. Juma at the bank will tell you to buy property. He is right.', 'end')
    d.end()
    out[d.id] = d.build()

    # Bibi Zawadi: residential gossip.
    d = DialogueBuilder('dlg_zawadi', 'Bibi Zawadi', 'Bibi Zawadi', portraits[VILLAGER])
    d.branch('owner', cond('var_own_house', 'eq', True), 'neighbour', 'hello')
    d.line('neighbour', 'So you bought the house next door! Good. The last tenant played the radio at 5 a.m. You do not play the radio at 5 a.m., yes?', 'end')
    d.line('hello', 'Karibu mtaani. The house with the sign is for sale, TSh 400,000. Good roof, quiet street, one nosy neighbour. Me.', 'end')
    d.end()
    out[d.id] = d.build()
    return out


def build_quests() -> dict[str, dict]:
    money = lambda n: add_var(MONEY, n)
    xp = lambda n: add_var(XP, n)
    out = [
        quest('qst_welcome', 'Welcome to Hacho', 'You just arrived in Hacho. Find Mama Neema on the market square, north of the junction, and say hello.',
              [('talk', 'Talk to Mama Neema at the market', cond('var_met_neema', 'eq', True))],
              [money(5000), xp(30), notify('Welcome to Hacho! +TSh 5,000  +30 XP', 'reward'), play('celebrate')]),
        quest('qst_lost_package', 'Lost Package', "Mama Neema's parcel went missing in the market. Search behind the stalls and bring it back to her.",
              [('find', 'Find the package in the market', cond('var_parcel', 'gte', 1)),
               ('return', 'Bring it to Mama Neema', cond('var_parcel_returned', 'eq', True))],
              [money(12000), xp(60), add_var(REP, 1), notify('Lost Package done: +TSh 12,000  +60 XP  +1 reputation', 'reward'), play('celebrate')]),
        quest('qst_quick_delivery', 'Quick Delivery', "Take Asha's order to Mama Ntilie at the restaurant, east of the junction, before the timer runs out.",
              [('deliver', 'Deliver to Mama Ntilie before the timer runs out', cond('var_delivered', 'eq', True))],
              [money(6000), xp(40), notify('Delivered on time: +TSh 6,000  +40 XP', 'reward'), play('celebrate')],
              time_limit_ms=90_000,
              on_fail=[notify('Too late! The order was cancelled.', 'warning'), set_var('var_delivery', 0)],
              repeatable=True),
        quest('qst_ball', "Baraka's Ball", 'Baraka kicked his football somewhere into the park. Find it near the trees and bring it back to him.',
              [('find', 'Find the football in the park', cond('var_ball', 'gte', 1)),
               ('return', 'Give the ball back to Baraka', cond('var_ball_returned', 'eq', True))],
              [money(3000), xp(25), add_var(REP, 1), notify("Baraka's Ball done: +TSh 3,000  +25 XP  +1 reputation", 'reward'), play('celebrate')]),
        quest('qst_first_property', 'Open for Business', 'Mr. Juma says property is the way up. Save TSh 250,000 and buy the Small Shop for sale on the main road.',
              [('buy', 'Buy the Small Shop (TSh 250,000)', cond('var_own_shop', 'eq', True))],
              [xp(100), add_var(REP, 1), notify('Open for Business! +100 XP  +1 reputation. Income arrives every morning.', 'reward'), play('celebrate')]),
        quest('qst_uptown', 'Uptown Access', 'The Uptown gate opens only for people the town trusts. Earn 3 reputation stars by returning lost things and opening a business, then walk in.',
              [('rep', 'Earn 3 reputation stars (help people around town)', cond(REP, 'gte', 3)),
               ('enter', 'Enter Uptown through the gate', cond('var_discovered_uptown', 'eq', True))],
              [money(20000), xp(80), notify('Uptown Access: +TSh 20,000  +80 XP', 'reward'), play('celebrate')]),
    ]
    return {q['id']: q for q in out}


# ----------------------------------------------------------------------------------------------------------------
# Assembly, verification, output


def load_json(path: str) -> dict:
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        fail(f'missing {os.path.relpath(path, ROOT)}')
        raise


def verify(doc: dict, hero: str = HERO) -> None:
    """Mirrors validateProject's referential rules so a broken layout fails here, not in the editor."""
    variables, dialogues, quests, scenes, chars, assets = doc['variables'], doc['dialogues'], doc['quests'], doc['scenes'], doc['characters'], doc['assets']
    for coll in ('assets', 'tilesets', 'maps', 'characters', 'scenes', 'dialogues', 'quests', 'variables'):
        for key, value in doc[coll].items():
            assert value['id'] == key, (coll, key)
    js_type = {'boolean': bool, 'number': (int, float), 'string': str}

    def check_var(var: str, value: Any, path: str, op: str | None = None) -> None:
        assert var in variables, f'{path}: unknown variable {var}'
        t = variables[var]['type']
        assert isinstance(value, js_type[t]) and not (t == 'number' and isinstance(value, bool)), f'{path}: {var} is {t}, got {value!r}'
        if op == 'add':
            assert t == 'number', f'{path}: add on non-number {var}'

    def check_cond(c: dict, path: str) -> None:
        check_var(c['variableId'], c['value'], path)

    def check_action(a: dict, path: str) -> None:
        t = a['type']
        if t == 'startDialogue':
            assert a['dialogueId'] in dialogues, f'{path}: unknown dialogue {a["dialogueId"]}'
        elif t == 'changeScene':
            assert a['sceneId'] in scenes, f'{path}: unknown scene {a["sceneId"]}'
        elif t == 'setVariable':
            check_var(a['variableId'], a['value'], path, a['op'])
        elif t == 'startQuest':
            assert a['questId'] in quests, f'{path}: unknown quest {a["questId"]}'
        elif t == 'playAnimation':
            assert a['animation'] in chars[hero]['animations'], f'{path}: hero has no animation {a["animation"]}'
        elif t == 'sequence':
            for i, sub in enumerate(a['actions']):
                check_action(sub, f'{path}.{i}')
        elif t in ('notify', 'setPlayerCharacter', 'removeEntity', 'completeQuestStep'):
            pass
        else:
            raise AssertionError(f'{path}: unknown action {t}')

    eco = doc['settings']['economy']
    for key in ('moneyVariableId', 'xpVariableId', 'reputationVariableId'):
        assert variables[eco[key]]['type'] == 'number', key
    ability_key = doc['settings'].get('abilityKey', 'X')
    assert ability_key not in (doc['settings']['attackKey'], doc['settings']['interactKey']), 'ability key clashes'
    assert doc['startSceneId'] in scenes
    for v in variables.values():
        check_var(v['id'], v['initial'], f'variables.{v["id"]}.initial')
    names = [v['name'] for v in variables.values()]
    assert len(names) == len(set(names)), 'duplicate variable names'

    for m in doc['maps'].values():
        n = m['width'] * m['height']
        assert len(m['collision']) == n
        for layer in m['layers']:
            assert len(layer['data']) == n, (m['id'], layer['name'])
    for c in chars.values():
        assert c['spriteSheetAssetId'] in assets, c['id']
        assert c.get('portraitAssetId') is None or c['portraitAssetId'] in assets, c['id']
    for t in doc['tilesets'].values():
        assert t['imageAssetId'] in assets, t['id']

    for s in scenes.values():
        assert s['mapId'] in doc['maps']
        assert sorted(s['entityOrder']) == sorted(s['entities']) and len(set(s['entityOrder'])) == len(s['entityOrder']), s['id']
        players = 0
        for e in s['entities'].values():
            types = [c['type'] for c in e['components']]
            assert len(types) == len(set(types)), (s['id'], e['id'])
            for i, c in enumerate(e['components']):
                p = f'{s["id"]}.{e["id"]}.{i}'
                if c['type'] == 'sprite':
                    assert c['characterId'] in chars, p
                elif c['type'] == 'playerControl':
                    players += 1
                elif c['type'] == 'interactable':
                    check_action(c['action'], p)
                elif c['type'] == 'trigger':
                    check_action(c['onEnter'], p)
                elif c['type'] == 'property':
                    assert variables[c['ownedVariableId']]['type'] == 'boolean', p
                elif c['type'] == 'shop':
                    for line in c['sells'] + c['buys']:
                        assert variables[line['variableId']]['type'] == 'number', p
                elif c['type'] == 'pickup':
                    assert variables[c['variableId']]['type'] == 'number', p
                elif c['type'] == 'lock':
                    check_cond(c['condition'], p)
                elif c['type'] == 'enemy' and c.get('onDefeat'):
                    check_action(c['onDefeat'], p)
        assert players == 1, f'scene {s["id"]} has {players} players'

    for d in dialogues.values():
        assert d['startNodeId'] in d['nodes'], d['id']
        for n in d['nodes'].values():
            p = f'{d["id"]}.{n["id"]}'
            for key in ('next', 'ifTrue', 'ifFalse'):
                if key in n and n[key] is not None:
                    assert n[key] in d['nodes'], f'{p}.{key} -> {n[key]}'
            if n['type'] == 'choice':
                for o in n['options']:
                    assert o['next'] is None or o['next'] in d['nodes'], f'{p} option {o["text"]!r}'
                    if 'condition' in o:
                        check_cond(o['condition'], p)
            elif n['type'] == 'set':
                check_var(n['variableId'], n['value'], p, n['op'])
            elif n['type'] == 'branch':
                check_cond(n['condition'], p)
            elif n['type'] == 'action':
                check_action(n['action'], p)
            elif n['type'] == 'line' and 'portraitAssetId' in n:
                assert n['portraitAssetId'] in assets, p
    for q in quests.values():
        ids = [st['id'] for st in q['steps']]
        assert len(ids) == len(set(ids)), q['id']
        for st in q['steps']:
            if 'completeWhen' in st:
                check_cond(st['completeWhen'], f'{q["id"]}.{st["id"]}')
        for i, a in enumerate(q.get('rewards', []) + q.get('onFail', [])):
            check_action(a, f'{q["id"]}.rewards.{i}')


def dumps(value: Any, indent: int = 0) -> str:
    """JSON with 2-space indentation, but arrays of scalars on one line (tile layers stay readable)."""
    pad = ' ' * indent
    if isinstance(value, dict):
        if not value:
            return '{}'
        items = [f'{pad}  {json.dumps(k)}: {dumps(v, indent + 2)}' for k, v in value.items()]
        return '{\n' + ',\n'.join(items) + f'\n{pad}}}'
    if isinstance(value, list):
        if not value:
            return '[]'
        if all(not isinstance(v, (dict, list)) for v in value):
            return '[' + ', '.join(json.dumps(v) for v in value) + ']'
        items = [f'{pad}  {dumps(v, indent + 2)}' for v in value]
        return '[\n' + ',\n'.join(items) + f'\n{pad}]'
    return json.dumps(value, ensure_ascii=False)


def main() -> int:
    manifest = load_json(MANIFEST)
    pack = {'characters': [], 'assets': [], 'playerCharacterId': HERO}

    # Tilesets: Outdoor first (grass = gid 1), then City.
    by_id = {t['id']: t for t in manifest['tilesets']}
    for tid in (OUTDOOR, CITY):
        if tid not in by_id:
            fail(f'manifest has no tileset {tid}')
    tilesets = [by_id[OUTDOOR], by_id[CITY]]
    tiles = Tiles(tilesets)
    for tag in OUTDOOR_TAGS + CITY_TAGS:
        tiles.gid(tag)
    for tid, names in STAMPS.items():
        for name in names:
            stamp, first = tiles.stamp(name)
            if first != next(r['firstGid'] for r in tiles.refs if r['tilesetId'] == tid):
                fail(f'stamp {name!r} is not in {tid}')

    # Characters and assets all come from the starter manifest (the Hacho boy is a starter character).
    chars = {c['id']: c for c in manifest['characters'] + pack['characters']}
    for cid in (HERO, VENDOR, BANKER, KID, VILLAGER):
        if cid not in chars:
            fail(f'no character {cid} in the manifest or the pack')
    if pack.get('playerCharacterId') != HERO:
        fail(f'pack playerCharacterId is {pack.get("playerCharacterId")!r}, expected {HERO!r}')
    for name in ('celebrate', 'phone', 'map', 'point', 'interact'):
        if name not in chars[HERO]['animations']:
            fail(f'{HERO} lacks the {name!r} emote animation')
    characters = {cid: chars[cid] for cid in (HERO, VENDOR, BANKER, KID, VILLAGER)}
    portraits = {cid: characters[cid].get('portraitAssetId') for cid in characters}

    assets_all = {a['id']: a for a in manifest['assets'] + pack['assets']}
    needed = [t['imageAssetId'] for t in tilesets]
    for c in characters.values():
        needed.append(c['spriteSheetAssetId'])
        if c.get('portraitAssetId'):
            needed.append(c['portraitAssetId'])
    assets: dict[str, dict] = {}
    for aid in needed:
        if aid not in assets_all:
            fail(f'no asset {aid} in the manifest or the pack')
        assets[aid] = assets_all[aid]

    # Variables.
    V = Variables()
    V.stat(MONEY, 'money', 50_000, 'Money'); V.stat(XP, 'xp', 0, 'XP'); V.stat(REP, 'reputation', 0, 'Reputation')
    V.item('var_parcel', 'parcel', 'Parcel'); V.item('var_ball', 'ball', 'Football'); V.item('var_tomatoes', 'tomatoes', 'Tomatoes')
    V.item('var_phone_credit', 'phone_credit', 'Phone credit'); V.item('var_snacks', 'snacks', 'Snacks'); V.item('var_delivery', 'delivery', "Asha's order")
    for key, label in (('shop', 'Small Shop'), ('restaurant', 'Restaurant'), ('house', 'House'), ('business', 'Large Business')):
        V.flag(f'var_own_{key}', f'own_{key}', f'Owns {label}')
    for key, label in (('neema', 'Mama Neema'), ('asha', 'Asha'), ('baraka', 'Baraka'), ('kombo', 'Mzee Kombo'), ('juma', 'Mr. Juma'), ('ntilie', 'Mama Ntilie'), ('hamisi', 'Mzee Hamisi')):
        V.flag(f'var_met_{key}', f'met_{key}', f'Met {label}')
    V.flag('var_lostpkg_started', 'lostpkg_started', 'Lost Package started'); V.flag('var_parcel_returned', 'parcel_returned', 'Parcel returned')
    V.flag('var_delivered', 'delivered', 'Order delivered')
    V.flag('var_ball_started', 'ball_started', "Baraka's Ball started"); V.flag('var_ball_returned', 'ball_returned', 'Ball returned')

    # Scenes. The interiors need the town-side spawns and the town needs the interior spawns, so build maps first.
    bank_map, bank_scene = build_bank(tiles, characters, {'x': 0, 'y': 0})
    rest_map, rest_scene = build_restaurant(tiles, characters, {'x': 0, 'y': 0})
    spawns = {BANK: bank_scene.spawn(5, 5, 'up'), RESTAURANT: rest_scene.spawn(6, 5, 'up')}
    town_map, town_scene = build_town(tiles, characters, V, spawns)
    town_spawns = {BANK: town_scene.spawn(37, 21, 'down'), RESTAURANT: town_scene.spawn(43, 21, 'down')}
    bank_map, bank_scene = build_bank(tiles, characters, town_spawns[BANK])
    rest_map, rest_scene = build_restaurant(tiles, characters, town_spawns[RESTAURANT])

    doc = {
        'schemaVersion': 4,
        'id': 'prj_hacho',
        'name': 'Hacho',
        'settings': {
            'title': 'Hacho',
            'viewport': {'width': 480, 'height': 270},
            'tileSize': T,
            'pixelArt': True,
            'defaultMoveSpeed': 96,
            'interactKey': 'E',
            'attackKey': 'SPACE',
            'runSpeedMultiplier': 1.8,
            'backgroundColor': '#1a1a2e',
            'presentation': {'tagline': 'A town, a hustle, a fortune to build.', 'startHour': 8},
            'economy': {
                'moneyVariableId': MONEY, 'xpVariableId': XP, 'reputationVariableId': REP,
                'currencyPrefix': 'TSh ', 'dayLengthMs': 120_000,
                'levelThresholds': [100, 250, 500, 900, 1400, 2100, 3000],
            },
        },
        'startSceneId': TOWN,
        'assets': assets,
        'tilesets': {t['id']: t for t in tilesets},
        'maps': {m.id: m.build() for m in (town_map, bank_map, rest_map)},
        'characters': characters,
        'scenes': {s.id: s.build() for s in (town_scene, bank_scene, rest_scene)},
        'dialogues': build_dialogues(portraits),
        'quests': build_quests(),
        'variables': V.table,
        'meta': {'createdAt': NOW, 'updatedAt': NOW, 'generator': GENERATOR},
    }

    for m in doc['maps'].values():
        for layer in m['layers']:
            assert all(0 <= g <= tiles.max_gid for g in layer['data']), m['id']
    verify(doc)

    text = dumps(doc) + '\n'
    if len(text.encode('utf-8')) > 2 * 1024 * 1024:
        fail('document exceeds the 2 MB limit')
    for path in OUTPUTS:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'wrote {os.path.relpath(path, ROOT)}')
    town = doc['scenes'][TOWN]
    print(f'town: {len(town["entities"])} entities, {sum(doc["maps"]["map_town"]["collision"])} solid cells; '
          f'{len(doc["dialogues"])} dialogues, {len(doc["quests"])} quests, {len(doc["variables"])} variables, {len(text)} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
