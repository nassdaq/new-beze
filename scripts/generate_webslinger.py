#!/usr/bin/env python3
"""Generates the "Webslinger" template project: a spider hero in a big-city downtown.

Reads the starter manifest (Outdoor and City tilesets, the townsfolk used as citizens) and the Webslinger art pack
(apps/editor/public/templates/webslinger/pack.json, rendered by `node scripts/art/render.mjs --pack webslinger`:
Spidey, the Thug, the Enforcer and the Rooftop tileset), lays the city out by hand and writes the same v4 document to

    apps/editor/public/templates/webslinger/project.json   (what the editor's "Webslinger" template card loads)
    docs/examples/webslinger.project.json                  (the fixture the tests validate)

    python3 scripts/generate_webslinger.py

The builders (tiles, maps, dialogues, quests, scenes) come from generate_hacho.py; this script adds what the game
needs on top: climbable collision (value 2) for walls and roof ledges, walkable roof interiors, a player with the
web ability, danger sense and climbing, enemies with onDefeat effects, and a boss interior.

Collision model: a building is a ring of climbable ledge tiles (2) around a walkable tar roof (0), with climbable
brick facade rows (2) below it. Everyone but the player treats 2 as solid, so thugs placed on a roof stay on that roof
and the player walks (or zips) up the facade, over the ledge and onto it. Roof furniture is ordinary solid (1).
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_hacho as H  # noqa: E402
from generate_hacho import DialogueBuilder, MapBuilder, SceneBuilder, Tiles, Variables, add_var, change_scene, cond, dumps, notify, play, quest, seq, set_var, start_quest, vary  # noqa: E402

ROOT = H.ROOT
PACK = os.path.join(ROOT, 'apps', 'editor', 'public', 'templates', 'webslinger', 'pack.json')
OUTPUTS = [
    os.path.join(ROOT, 'apps', 'editor', 'public', 'templates', 'webslinger', 'project.json'),
    os.path.join(ROOT, 'docs', 'examples', 'webslinger.project.json'),
]
T = H.T
NOW = '2026-09-30T00:00:00.000Z'
GENERATOR = 'beze-docs/webslinger-0.1'

OUTDOOR, CITY, ROOF = 'tls_outdoor', 'tls_city', 'tls_rooftop'
HERO, THUG, BOSS = 'chr_spidey', 'chr_thug', 'chr_enforcer'
VENDOR, BANKER, KID, VILLAGER = 'chr_vendor', 'chr_banker', 'chr_kid', 'chr_villager'
MONEY, XP, REP = 'var_money', 'var_xp', 'var_rep'
CITY_SCENE, WAREHOUSE = 'scn_downtown', 'scn_warehouse'

ROOF_TAGS = ['roof_tar', 'roof_tar2', 'roof_ledge_n', 'roof_ledge_s', 'roof_ledge_w', 'roof_ledge_e', 'roof_ledge_nw', 'roof_ledge_ne',
             'roof_ledge_sw', 'roof_ledge_se', 'wall_brick', 'wall_brick_window', 'wall_graffiti', 'wall_fire_escape', 'warehouse_door',
             'wall_grey', 'alley', 'alley_manhole', 'alley_puddle', 'dumpster', 'crate', 'barrel', 'web_cocoon', 'sign_pizza', 'roof_vent',
             'roof_ac', 'roof_skylight', 'roof_hatch', 'roof_antenna', 'roof_pipe', 'sign_news', 'sign_web']
CITY_TAGS = ['road', 'road_line_h', 'road_line_v', 'road_cross', 'crosswalk_h', 'crosswalk_v', 'sidewalk', 'sidewalk_edge_n', 'sidewalk_edge_s',
             'sidewalk_edge_w', 'sidewalk_edge_e', 'sidewalk_corner_nw', 'sidewalk_corner_ne', 'sidewalk_corner_sw', 'sidewalk_corner_se',
             'paving', 'sign_bank', 'sign_food', 'bench', 'lamp', 'trash', 'hydrant', 'hedge', 'flowerbed', 'barrier', 'cone', 'sidewalk2', 'road2',
             'fence_city_h', 'fence_city_v']
OUTDOOR_TAGS = ['grass', 'grass2', 'flowers', 'tall_grass', 'flower_red', 'flower_blue', 'bush', 'rock', 'path', 'flower_yellow', 'bush_berry']
STAMPS = {OUTDOOR: ['Tree', 'Pine'], CITY: ['Restaurant', 'Bank', 'StallA', 'StallB', 'Fountain', 'Kiosk'], ROOF: ['WaterTower', 'Billboard']}


def fail(message: str) -> None:
    sys.exit(f'generate_webslinger.py: {message}')


# ----------------------------------------------------------------------------------------------------------------
# Climbable collision on top of the Hacho builders


class ClimbTiles(Tiles):
    """Also remembers which gids are climbable (walls, ledges): collision value 2 instead of 1."""

    def __init__(self, tilesets: list[dict]):
        super().__init__(tilesets)
        self.climbable: set[int] = set()
        gid = 1
        for t in tilesets:
            for local, p in t['tileProperties'].items():
                if p.get('climbable'):
                    self.climbable.add(gid + int(local))
            gid += t['tileCount']


class CityMap(MapBuilder):
    """Collision: 1 where any layer has a solid non-climbable tile, else 2 where any has a climbable one, else 0."""

    tiles: ClimbTiles

    def value_at(self, x: int, y: int) -> int:
        if (x, y) in self.open:
            return 0
        i = self.idx(x, y)
        cells = (self.ground[i], self.deco[i])
        if any(g in self.tiles.solid and g not in self.tiles.climbable for g in cells):
            return 1
        if any(g in self.tiles.climbable for g in cells):
            return 2
        return 0

    def solid_at(self, x: int, y: int) -> bool:
        return self.value_at(x, y) != 0

    def collision(self) -> list[int]:
        return [self.value_at(x, y) for y in range(self.h) for x in range(self.w)]

    def building(self, x0: int, y0: int, w: int, h: int, facade: int = 3, wall: str = 'wall_brick', door_x: int | None = None) -> None:
        """A brick building whose top-left roof corner is (x0, y0): a ledge ring, tar inside, `facade` rows of wall below.
        Total height is h (roof rows) + facade. `door_x` puts the walkable warehouse door on the bottom facade row."""
        if h < 3:
            fail(f'building at ({x0}, {y0}) needs at least 3 roof rows')
        for j in range(h):
            for i in range(w):
                x, y = x0 + i, y0 + j
                if j == 0:
                    tag = 'roof_ledge_nw' if i == 0 else 'roof_ledge_ne' if i == w - 1 else 'roof_ledge_n'
                elif j == h - 1:
                    tag = 'roof_ledge_sw' if i == 0 else 'roof_ledge_se' if i == w - 1 else 'roof_ledge_s'
                elif i == 0:
                    tag = 'roof_ledge_w'
                elif i == w - 1:
                    tag = 'roof_ledge_e'
                else:
                    tag = vary(x, y, 'roof_tar', 'roof_tar2', 6)
                self.g(x, y, tag)
        for j in range(facade):
            for i in range(w):
                x, y = x0 + i, y0 + h + j
                if door_x is not None and j == facade - 1 and x == door_x:
                    tag = 'warehouse_door'
                elif j == facade - 1 and (x + y) % 5 == 2:
                    tag = 'wall_graffiti' if wall == 'wall_brick' else wall
                elif j < facade - 1 and (x - x0) % 2 == 1:
                    tag = 'wall_brick_window' if wall == 'wall_brick' else wall
                else:
                    tag = wall
                self.g(x, y, tag)


class HeroScene(SceneBuilder):
    def player(self, tx: int, ty: int, facing: str) -> str:
        return self.sprite(f'ent_{self.id[4:]}_player', 'Spidey', HERO, tx, ty, facing, [
            {'type': 'playerControl', 'attackDamage': 1, 'climb': True, 'senseRadius': 110,
             'ability': {'type': 'web', 'rangeTiles': 7, 'damage': 0, 'cooldownMs': 600, 'stunMs': 2600, 'zip': True}},
            {'type': 'health', 'max': 5},
        ])

    def spawn(self, tx: int, ty: int, facing: str) -> dict:
        c = self.characters[HERO]['collider']
        if self.map.solid_at(tx, ty):
            fail(f'scene {self.id}: spawn ({tx}, {ty}) is a solid cell')
        return {'x': tx * T + T // 2 - (c['offsetX'] + c['width'] // 2), 'y': ty * T + T - (c['offsetY'] + c['height']), 'facing': facing}

    def thug(self, id_: str, name: str, tx: int, ty: int, facing: str, on_defeat: dict | None = None, wander: int | None = 32, boss: bool = False) -> str:
        enemy: dict = ({'type': 'enemy', 'speed': 44, 'aggroRadius': 200, 'damage': 2, 'attackCooldownMs': 1300} if boss
                       else {'type': 'enemy', 'speed': 58, 'aggroRadius': 150, 'damage': 1, 'attackCooldownMs': 950})
        if on_defeat:
            enemy['onDefeat'] = on_defeat
        comps: list[dict] = [{'type': 'health', 'max': 14 if boss else 3}, enemy]
        if wander:
            comps.append({'type': 'wander', 'radius': wander, 'speed': 22})
        return self.sprite(id_, name, BOSS if boss else THUG, tx, ty, facing, comps)

    def note(self, id_: str, name: str, tx: int, ty: int, text_: str, prompt: str = 'Read', on_solid: bool = True) -> str:
        return self.plain(id_, name, tx, ty, [{'type': 'interactable', 'prompt': prompt, 'action': notify(text_)}], on_solid=on_solid)


# ----------------------------------------------------------------------------------------------------------------
# Downtown


def build_downtown(tiles: ClimbTiles, chars: dict[str, dict], V: Variables, warehouse_spawn: dict) -> tuple[CityMap, HeroScene]:
    W, Hh = 64, 48
    m = CityMap(tiles, 'map_downtown', 'Downtown', W, Hh, 'sidewalk')
    for y in range(Hh):
        for x in range(W):
            m.g(x, y, vary(x, y, 'sidewalk', 'sidewalk2', 9))

    # --- Streets: Main Avenue (rows 22-24), Second Street (rows 41-43), Park Avenue north-south (cols 30-32).
    def h_road(y0: int, x_from: int, x_to: int) -> None:
        for y in range(y0, y0 + 3):
            for x in range(x_from, x_to + 1):
                m.g(x, y, 'road_line_h' if y == y0 + 1 else vary(x, y, 'road', 'road2', 9))
        for x in range(x_from, x_to + 1):
            m.g(x, y0 - 1, 'sidewalk_edge_s'); m.g(x, y0 + 3, 'sidewalk_edge_n')

    def v_road(x0: int, y_from: int, y_to: int) -> None:
        for x in range(x0, x0 + 3):
            for y in range(y_from, y_to + 1):
                m.g(x, y, 'road_line_v' if x == x0 + 1 else vary(x, y, 'road', 'road2', 9))
        for y in range(y_from, y_to + 1):
            m.g(x0 - 1, y, 'sidewalk_edge_e'); m.g(x0 + 3, y, 'sidewalk_edge_w')

    def crossing(x0: int, y0: int) -> None:
        """Park Avenue (x0..x0+2) crossing a horizontal road (y0..y0+2): plain asphalt, a centre cross, curb corners, zebras."""
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + 3):
                m.g(x, y, 'road')
        m.g(x0, y0 + 1, 'road_line_h'); m.g(x0 + 2, y0 + 1, 'road_line_h'); m.g(x0 + 1, y0, 'road_line_v'); m.g(x0 + 1, y0 + 2, 'road_line_v')
        m.g(x0 + 1, y0 + 1, 'road_cross')
        m.g(x0 - 1, y0 - 1, 'sidewalk_corner_se'); m.g(x0 + 3, y0 - 1, 'sidewalk_corner_sw'); m.g(x0 - 1, y0 + 3, 'sidewalk_corner_ne'); m.g(x0 + 3, y0 + 3, 'sidewalk_corner_nw')
        for y in range(y0, y0 + 3):
            m.g(x0 - 1, y, 'crosswalk_v'); m.g(x0 + 3, y, 'crosswalk_v')
        for x in range(x0, x0 + 3):
            m.g(x, y0 - 1, 'crosswalk_h'); m.g(x, y0 + 3, 'crosswalk_h')

    h_road(22, 1, 62)
    h_road(41, 1, 62)
    v_road(30, 2, 45)
    crossing(30, 22)
    crossing(30, 41)

    # --- Tree border, barriers where the roads run into it.
    for x in range(W):
        m.tree(x, 1); m.tree(x, Hh - 1)
    for y in range(2, Hh - 1):
        m.tree(0, y); m.tree(W - 1, y)
    for (x, y) in [(1, 22), (1, 23), (1, 24), (62, 22), (62, 23), (62, 24), (1, 41), (1, 42), (1, 43), (62, 41), (62, 42), (62, 43), (30, 2), (31, 2), (32, 2), (30, 45), (31, 45), (32, 45)]:
        m.d(x, y, 'barrier')

    # --- NW: the park (grass, trees, a fountain) and, east of it, the alley and Spidey's apartment block.
    m.rect_g(2, 2, 13, 19, 'grass')
    for y in range(2, 20):
        for x in range(2, 14):
            m.g(x, y, vary(x, y, 'grass', 'grass2', 5))
    for x in range(2, 14):
        m.g(x, 19, 'sidewalk')
    m.stamp('Fountain', 7, 9)
    for (x, y) in [(3, 4), (10, 3), (4, 13), (12, 8), (11, 15), (3, 9)]:
        m.tree(x, y)
    for (x, y, tag) in [(6, 6, 'flowerbed'), (9, 6, 'flowerbed'), (6, 13, 'flowerbed'), (9, 13, 'flowerbed'), (5, 9, 'bench'), (10, 9, 'bench'), (7, 16, 'flowers'), (12, 12, 'bush'), (4, 17, 'flower_yellow'), (2, 6, 'bush_berry'), (5, 3, 'lamp'), (10, 17, 'lamp')]:
        m.d(x, y, tag)
    for y in range(4, 19):
        m.g(7, y, 'path'); m.g(8, y, 'path')
    m.g(7, 9, 'paving'); m.g(8, 9, 'paving'); m.g(7, 10, 'paving'); m.g(8, 10, 'paving')
    # the alley between the park and the apartment block
    m.rect_g(14, 2, 15, 19, 'alley')
    for (x, y, tag) in [(14, 3, 'dumpster'), (15, 8, 'crate'), (14, 12, 'barrel'), (15, 17, 'web_cocoon')]:
        m.d(x, y, tag)
    m.g(15, 5, 'alley_puddle'); m.g(14, 15, 'alley_manhole')
    # Spidey's block: roof rows 8-15, facade 16-19; roof furniture; the HERO sign by the stoop
    m.building(16, 8, 12, 8, facade=4)
    for (x, y, tag) in [(18, 10, 'roof_vent'), (24, 10, 'roof_ac'), (25, 12, 'roof_skylight'), (26, 14, 'roof_antenna'), (18, 14, 'roof_pipe'), (19, 14, 'roof_pipe')]:
        m.d(x, y, tag)
    m.d(27, 20, 'sign_web'); m.d(16, 21, 'lamp'); m.d(26, 21, 'hydrant'); m.d(20, 21, 'trash')
    # a small kiosk on the corner by Park Avenue
    m.stamp('Kiosk', 26, 3); m.d(25, 4, 'bench'); m.d(28, 4, 'lamp')

    # --- NE: the Daily Buzz (with a billboard on its roof), an alley, the Grand Hotel (water tower).
    m.building(36, 3, 13, 13, facade=4)
    m.stamp('Billboard', 39, 5)
    for (x, y, tag) in [(45, 6, 'roof_ac'), (38, 10, 'roof_skylight'), (44, 11, 'roof_vent'), (46, 13, 'roof_antenna'), (39, 13, 'roof_pipe'), (40, 13, 'roof_pipe')]:
        m.d(x, y, tag)
    m.d(35, 21, 'sign_news'); m.d(49, 21, 'lamp'); m.d(37, 21, 'bench'); m.d(46, 21, 'trash')
    m.rect_g(49, 2, 50, 19, 'alley')
    for (x, y, tag) in [(49, 4, 'barrel'), (50, 9, 'crate'), (49, 14, 'dumpster')]:
        m.d(x, y, tag)
    m.g(50, 6, 'alley_puddle'); m.g(49, 17, 'alley_manhole')
    m.building(51, 2, 11, 14, facade=4)
    m.stamp('WaterTower', 53, 4)
    for (x, y, tag) in [(58, 5, 'roof_vent'), (59, 9, 'roof_ac'), (54, 12, 'roof_skylight'), (57, 13, 'roof_pipe'), (58, 13, 'roof_pipe')]:
        m.d(x, y, tag)
    m.d(57, 21, 'lamp'); m.d(52, 21, 'bench'); m.d(60, 21, 'hydrant')

    # --- SW: the flower market (Rosa), Papa Ray's Pizza, the alley of the purse snatcher, the Apartments.
    m.rect_g(2, 27, 12, 33, 'paving')
    for (x, y, name) in [(3, 28, 'StallA'), (6, 28, 'StallB'), (9, 28, 'StallA')]:
        m.stamp(name, x, y)
    for (x, y, tag) in [(2, 32, 'flowerbed'), (4, 32, 'flowerbed'), (10, 32, 'flowerbed'), (12, 32, 'flowerbed'), (7, 32, 'bench'), (12, 27, 'lamp'), (2, 27, 'trash')]:
        m.d(x, y, tag)
    m.rect_g(2, 34, 12, 35, 'grass')
    for (x, y, tag) in [(3, 34, 'bush'), (11, 34, 'bush'), (6, 35, 'flower_red'), (9, 35, 'flower_blue')]:
        m.d(x, y, tag)
    m.stamp('Restaurant', 4, 36)         # Papa Ray's: door at (5, 38)
    m.d(9, 37, 'sign_pizza'); m.d(2, 39, 'lamp'); m.d(11, 39, 'trash'); m.d(9, 36, 'hedge'); m.d(10, 36, 'hedge'); m.d(3, 39, 'cone')
    m.rect_g(14, 27, 15, 38, 'alley')
    for (x, y, tag) in [(14, 28, 'crate'), (15, 31, 'dumpster'), (14, 36, 'barrel')]:
        m.d(x, y, tag)
    m.g(15, 29, 'alley_manhole'); m.g(14, 33, 'alley_puddle')
    m.building(17, 27, 11, 8, facade=4)   # roof 27-34, facade 35-38
    for (x, y, tag) in [(19, 29, 'roof_ac'), (25, 29, 'roof_vent'), (22, 32, 'roof_skylight'), (25, 33, 'roof_antenna')]:
        m.d(x, y, tag)
    m.d(18, 40, 'lamp'); m.d(26, 40, 'bench'); m.d(22, 40, 'hydrant')
    # south of Second Street: a strip of sidewalk with hedges and a fence
    for x in range(2, 29):
        if x % 7 == 3:
            m.d(x, 46, 'lamp')
        elif x % 2 == 0:
            m.d(x, 46, 'hedge')

    # --- SE: City Bank (being robbed), an alley with a cocoon, the Warehouse (the boss's place, hostage on its roof).
    m.stamp('Bank', 36, 36)              # door at (37, 38)
    m.d(41, 37, 'sign_bank'); m.d(35, 40, 'lamp'); m.d(40, 39, 'cone'); m.d(42, 39, 'cone'); m.rect_g(36, 27, 40, 35, 'paving')
    for (x, y, tag) in [(36, 28, 'flowerbed'), (40, 28, 'flowerbed'), (38, 30, 'bench'), (36, 33, 'trash'), (40, 33, 'lamp')]:
        m.d(x, y, tag)
    m.rect_g(41, 27, 44, 35, 'alley'); m.rect_g(42, 36, 44, 38, 'alley')
    for (x, y, tag) in [(41, 29, 'dumpster'), (44, 31, 'crate'), (43, 34, 'web_cocoon'), (42, 36, 'barrel'), (44, 27, 'barrel')]:
        m.d(x, y, tag)
    m.g(43, 30, 'alley_puddle'); m.g(42, 33, 'alley_manhole')
    m.building(45, 27, 17, 8, facade=4, door_x=53)   # roof 27-34, facade 35-38, door (53, 38)
    for (x, y, tag) in [(47, 29, 'roof_pipe'), (48, 29, 'roof_pipe'), (49, 29, 'roof_pipe'), (59, 29, 'roof_ac'), (52, 32, 'roof_vent'), (60, 33, 'roof_antenna'), (47, 33, 'roof_skylight')]:
        m.d(x, y, tag)
    m.d(46, 40, 'lamp'); m.d(61, 40, 'lamp'); m.d(57, 39, 'trash'); m.d(49, 39, 'hydrant')
    for x in range(35, 62):
        if x % 7 == 5:
            m.d(x, 46, 'lamp')
        elif x % 2 == 1:
            m.d(x, 46, 'hedge')

    # ---------------------------------------------------------------------------------------------- entities
    s = HeroScene(CITY_SCENE, 'Downtown', m, chars)
    START = (21, 20)
    s.player(*START, 'right')
    s.trigger('ent_downtown_welcome', 'Welcome trigger', START[0], START[1], 1, 1, seq(notify('Downtown. Press X to shoot a web: it webs a thug, or zips you to a wall.'), start_quest('qst_power')), once=True)

    def place(key: str, label: str, icon: str, marker_at: tuple[int, int], *zones: tuple[int, int, int, int]) -> None:
        flag = V.flag(f'var_discovered_{key}', f'discovered_{key}', f'Discovered {label}')
        s.marker(f'ent_downtown_marker_{key}', label, icon, *marker_at)
        for i, (tx, ty, w, h) in enumerate(zones):
            s.trigger(f'ent_downtown_enter_{key}{"" if i == 0 else i + 1}', f'Enter {label}', tx, ty, w, h, set_var(flag, True), once=True)

    place('home', 'Home', 'home', (22, 21), (21, 21, 3, 1))
    place('roof', 'Your Rooftop', 'place', (22, 11), (20, 9, 4, 4))
    place('park', 'Park', 'park', (7, 11), (7, 17, 2, 1), (7, 4, 2, 1))
    place('pizza', "Papa Ray's Pizza", 'food', (5, 39), (4, 39, 4, 1))
    place('market', 'Flower Market', 'market', (7, 33), (6, 33, 3, 1), (7, 27, 1, 1))
    place('buzz', 'The Daily Buzz', 'place', (42, 21), (38, 21, 8, 1))
    place('hotel', 'Grand Hotel roof', 'place', (56, 8), (55, 7, 4, 4))
    place('bank', 'City Bank', 'bank', (38, 39), (36, 39, 4, 1))
    place('warehouse', 'Warehouse', 'mission', (53, 39), (52, 39, 3, 1))

    # Doors: the warehouse (locked until the town trusts you), its lock on the door cell.
    s.plain('ent_downtown_warehouse_lock', 'Warehouse door', 53, 38, [{'type': 'lock', 'condition': cond(REP, 'gte', 3),
        'lockedText': 'Chained from the inside. The Enforcer only opens for someone the city talks about (3 reputation).'}])
    s.trigger('ent_downtown_door_warehouse', 'Warehouse door', 53, 38, 1, 1, change_scene(WAREHOUSE, warehouse_spawn), once=False)
    s.trigger('ent_downtown_gate_quest', 'Warehouse approach', 52, 39, 3, 1, start_quest('qst_showdown'), once=True)

    # Citizens.
    s.npc('ent_downtown_mae', 'Aunt Mae', VILLAGER, 18, 20, 'right', 'dlg_mae')
    s.npc('ent_downtown_ray', 'Papa Ray', VENDOR, 6, 39, 'down', 'dlg_ray')
    s.npc('ent_downtown_rosa', 'Rosa', VENDOR, 6, 31, 'down', 'dlg_rosa', wander=16)
    s.npc('ent_downtown_lee', 'Officer Lee', BANKER, 34, 28, 'left', 'dlg_lee')
    s.npc('ent_downtown_jj', 'J. J. Jameson', BANKER, 42, 20, 'down', 'dlg_jj')
    s.npc('ent_downtown_delmar', 'Mr. Delmar', VILLAGER, 56, 9, 'down', 'dlg_delmar')
    s.npc('ent_downtown_gwen', 'Gwen', KID, 9, 12, 'left', 'dlg_gwen', wander=48)
    s.npc('ent_downtown_miles', 'Miles', KID, 58, 31, 'down', 'dlg_miles', prompt='Free')

    # Thugs. The alley thug is the tutorial target; the purse snatcher drops Rosa's purse; three rob the bank;
    # two guard Miles on the warehouse roof.
    s.thug('ent_downtown_thug_alley', 'Alley Thug', 15, 13, 'down', on_defeat=set_var('var_alley_thug', True), wander=40)
    s.thug('ent_downtown_thug_purse', 'Purse Snatcher', 15, 34, 'up', on_defeat=seq(set_var('var_purse', 1), notify("He drops Rosa's purse. Take it back to her.", 'reward')), wander=48)
    for i, (x, y, facing) in enumerate([(37, 39, 'down'), (39, 40, 'left'), (40, 27, 'down')]):
        s.thug(f'ent_downtown_thug_bank_{i + 1}', 'Bank Robber', x, y, facing, on_defeat=add_var('var_bank_thugs', 1), wander=24)
    s.thug('ent_downtown_thug_roof_1', 'Rooftop Guard', 51, 31, 'right', wander=32)
    s.thug('ent_downtown_thug_roof_2', 'Rooftop Guard', 55, 32, 'left', wander=32)
    s.thug('ent_downtown_thug_hotel', 'Hotel Prowler', 59, 12, 'left', wander=40)
    s.thug('ent_downtown_thug_park', 'Park Mugger', 11, 5, 'down', wander=56)

    # Small readable things.
    s.note('ent_downtown_sign_web', 'HERO sign', 27, 20, 'A hand-painted board: "OUR FRIENDLY NEIGHBOURHOOD HERO LIVES HERE (allegedly)".')
    s.note('ent_downtown_sign_news', 'Daily Buzz sign', 35, 21, 'THE DAILY BUZZ. Today: "MASKED MENACE OR MISUNDERSTOOD?" Photos wanted, see the editor.')
    s.note('ent_downtown_sign_pizza', 'Pizza sign', 9, 37, "PAPA RAY'S: 30 minutes or it's free. Deliveries by rooftop welcome.")
    s.note('ent_downtown_sign_bank', 'Bank sign', 41, 37, 'CITY BANK. Please do not rob us. Thank you.')
    s.note('ent_downtown_fountain', 'Fountain', 7, 9, 'You watch the water for a moment. Somewhere, a siren.', prompt='Look')
    s.note('ent_downtown_cocoon', 'Webbed bundle', 43, 34, 'A thug, webbed to the wall since yesterday. He asks what time it is.', prompt='Look')

    # Collectibles: tips on the sidewalks and roofs, three photos on the high roofs.
    coins = [(24, 21), (10, 21), (48, 21), (61, 21), (29, 8), (34, 12), (10, 40), (28, 40), (44, 40), (59, 40), (21, 11), (43, 7), (57, 5), (23, 31), (50, 30), (12, 45), (40, 45)]
    for i, (x, y) in enumerate(coins):
        s.pickup(f'ent_downtown_tip_{i + 1}', 'Tip', x, y, MONEY, 10)
    s.pickup('ent_downtown_photo_1', 'Photo', 46, 8, 'var_photos', 1)
    s.pickup('ent_downtown_photo_2', 'Photo', 22, 30, 'var_photos', 1)
    s.pickup('ent_downtown_photo_3', 'Photo', 60, 6, 'var_photos', 1)
    return m, s


# ----------------------------------------------------------------------------------------------------------------
# The warehouse (boss interior)


def build_warehouse(tiles: ClimbTiles, chars: dict[str, dict], city_spawn: dict) -> tuple[CityMap, HeroScene]:
    w, h = 18, 12
    m = CityMap(tiles, 'map_warehouse', 'Warehouse', w, h, 'alley')
    for y in range(h):
        for x in range(w):
            m.g(x, y, vary(x, y, 'alley', 'alley_puddle', 11))
    for x in range(w):
        m.d(x, 0, 'wall_grey')
        if x != 9:
            m.d(x, h - 1, 'wall_grey')
    for y in range(1, h - 1):
        m.d(0, y, 'wall_grey'); m.d(w - 1, y, 'wall_grey')
    for (x, y, tag) in [(2, 1, 'crate'), (3, 1, 'crate'), (2, 2, 'barrel'), (15, 1, 'crate'), (16, 1, 'barrel'), (16, 2, 'crate'), (5, 5, 'crate'), (12, 5, 'barrel'), (2, 9, 'barrel'), (15, 9, 'crate'), (8, 3, 'web_cocoon')]:
        m.d(x, y, tag)
    m.g(9, 7, 'alley_manhole')
    s = HeroScene(WAREHOUSE, 'Warehouse', m, chars)
    s.player(9, 9, 'up')
    s.thug('ent_warehouse_enforcer', 'The Enforcer', 9, 3, 'down', boss=True, wander=None,
           on_defeat=seq(set_var('var_enforcer_down', True), notify('The Enforcer goes down. The warehouse is quiet.', 'reward')))
    s.thug('ent_warehouse_thug_1', 'Henchman', 4, 6, 'right', wander=24)
    s.thug('ent_warehouse_thug_2', 'Henchman', 14, 6, 'left', wander=24)
    s.trigger('ent_warehouse_exit', 'Exit', 9, 11, 1, 1, change_scene(CITY_SCENE, city_spawn), once=False)
    s.note('ent_warehouse_cocoon', 'Webbed guard', 8, 3, 'Someone got here before you. He looks embarrassed.', prompt='Look')
    return m, s


# ----------------------------------------------------------------------------------------------------------------
# Dialogues and quests


def build_dialogues(portraits: dict[str, str | None]) -> dict[str, dict]:
    out: dict[str, dict] = {}

    d = DialogueBuilder('dlg_mae', 'Aunt Mae', 'Aunt Mae', portraits[VILLAGER])
    d.branch('met', cond('var_met_mae', 'eq', True), 'again', 'hello')
    d.line('hello', 'There you are! Off to "the library" again in that outfit? Mm-hm. Be careful out there, the radio says thugs are everywhere.', 'meet')
    d.set('meet', 'var_met_mae', True, 'tip')
    d.line('tip', 'Rosa at the flower market lost her purse, Ray needs a delivery boy, and that awful newspaper man wants photos. Everyone needs a hero. Eat something first.', 'end')
    d.line('again', 'Still out? Remember: with great power comes a great big appetite. There is pizza money on the counter.', 'end')
    d.end()
    out[d.id] = d.build()

    d = DialogueBuilder('dlg_gwen', 'Gwen', 'Gwen', portraits[KID])
    d.line('hello', 'Are you the spider guy? My friend Miles went to look at the warehouse roof and never came back. The Enforcer\'s people are up there.', 'more')
    d.line('more', 'You can climb, right? Walk into a wall and keep going. Or press X at a building: the web pulls you up. I saw you do it. Everyone saw.', 'end')
    d.end()
    out[d.id] = d.build()

    d = DialogueBuilder('dlg_rosa', 'Rosa', 'Rosa', portraits[VENDOR])
    d.branch('returned', cond('var_purse_returned', 'eq', True), 'thanks', 'started')
    d.line('thanks', 'My hero! The flowers are on the house. Well, one flower. Business is business.', 'end')
    d.branch('started', cond('var_purse_started', 'eq', True), 'holding', 'hello')
    d.branch('holding', cond('var_purse', 'gte', 1), 'found', 'looking')
    d.line('found', 'My purse! Everything is still in it, even the coupons. Thank you, thank you!', 'take')
    d.set('take', 'var_purse', -1, 'take2', op='add')
    d.set('take2', 'var_purse_returned', True, 'end')
    d.line('looking', 'He ran into the alley behind my stall, the one with the dumpster. Green hoodie, baseball bat, no manners.', 'end')
    d.line('hello', 'A masked man! Good, I need one. A thug grabbed my purse and ran into the alley behind the stalls. Get it back and I will remember you.', 'choice')
    d.choice('choice', None, [('On it.', 'job'), ('Call the police?', 'police')])
    d.action('job', start_quest('qst_purse'), 'job_flag')
    d.set('job_flag', 'var_purse_started', True, 'job2')
    d.line('job2', 'Web him, punch him, whatever you people do. Just bring the purse.', 'end')
    d.line('police', 'Officer Lee is busy with the bank. Which is being robbed. Right now. This city, I tell you.', 'end')
    d.end()
    out[d.id] = d.build()

    d = DialogueBuilder('dlg_ray', 'Papa Ray', 'Papa Ray', portraits[VENDOR])
    d.branch('carrying', cond('var_pizza', 'gte', 1), 'hurry', 'met')
    d.line('hurry', 'Why is the pizza still here?! Mr. Delmar, Grand Hotel roof, north-east. Sixty seconds! Use the roofs!', 'end')
    d.branch('met', cond('var_met_ray', 'eq', True), 'again', 'hello')
    d.line('hello', "Papa Ray's, best slice downtown. You look like someone who can get to a roof fast. I have a customer on the Grand Hotel roof and no delivery boy.", 'meet')
    d.set('meet', 'var_met_ray', True, 'choice')
    d.line('again', 'Ah, the fast one. Another delivery?', 'choice')
    d.choice('choice', None, [('Give me the pizza.', 'job'), ('Not now.', 'bye')])
    d.action('job', seq(set_var('var_pizza_delivered', False), set_var('var_pizza', 1), start_quest('qst_pizza')), 'job2')
    d.line('job2', 'Grand Hotel, north-east, on the ROOF. Mr. Delmar. Sixty seconds or he does not pay and neither do I. Go go go!', 'end')
    d.line('bye', 'Fine. The pizza waits for no one.', 'end')
    d.end()
    out[d.id] = d.build()

    d = DialogueBuilder('dlg_delmar', 'Mr. Delmar', 'Mr. Delmar', portraits[VILLAGER])
    d.branch('order', cond('var_pizza', 'gte', 1), 'got', 'idle')
    d.line('got', 'By rooftop! Still hot! Kid, you are wasted on this town. Here is a tip.', 'got_take')
    d.set('got_take', 'var_pizza', 0, 'got_flag')
    d.set('got_flag', 'var_pizza_delivered', True, 'end')
    d.line('idle', 'Best view in the city, worst pizza delivery times. Papa Ray keeps promising.', 'end')
    d.end()
    out[d.id] = d.build()

    d = DialogueBuilder('dlg_lee', 'Officer Lee', 'Officer Lee', portraits[BANKER])
    d.branch('bank_done', cond('var_bank_thugs', 'gte', 3), 'after', 'started')
    d.branch('after', cond('var_rescued', 'eq', True), 'hero', 'rescue_started')
    d.line('hero', 'Bank saved, kid saved. I did not see you climb that wall and I will keep not seeing it. Go get the Enforcer.', 'end')
    d.branch('rescue_started', cond('var_rescue_started', 'eq', True), 'rescue_wait', 'rescue')
    d.line('rescue_wait', 'Miles is still on the warehouse roof, south-east. Two of them up there with bats. Roofs are your thing, not mine.', 'end')
    d.action('rescue', start_quest('qst_rescue'), 'rescue_flag')
    d.set('rescue_flag', 'var_rescue_started', True, 'rescue2')
    d.line('rescue2', 'Bank\'s clear, thanks to you. Next: a kid named Miles is being held on the warehouse roof, south-east. I can\'t get up there. You can.', 'end')
    d.branch('started', cond('var_bank_started', 'eq', True), 'wait', 'hello')
    d.line('wait', 'Three of them at the bank, south side of Main across Park Avenue. Bats. Web them first, then hit them; they cannot swing back when they are wrapped.', 'end')
    d.line('hello', 'Halt! ...oh. The spider fella. Look, the City Bank is being robbed right now, three thugs, and my backup is on lunch. Care to help?', 'choice')
    d.choice('choice', None, [('Say no more.', 'job'), ('Three? Easy.', 'job')])
    d.action('job', start_quest('qst_bank'), 'job_flag')
    d.set('job_flag', 'var_bank_started', True, 'job2')
    d.line('job2', 'South of Main, across Park Avenue, the white building with the columns. Tip: a webbed thug takes double damage.', 'end')
    d.end()
    out[d.id] = d.build()

    d = DialogueBuilder('dlg_jj', 'J. J. Jameson', 'J. J. Jameson', portraits[BANKER])
    d.branch('sold', cond('var_photos_sold', 'eq', True), 'after', 'started')
    d.line('after', 'Front page! "MENACE CAUGHT ON CAMERA". Sold out in an hour. Bring me more and I will call you a hero. Maybe. In small print.', 'end')
    d.branch('started', cond('var_photos_started', 'eq', True), 'holding', 'hello')
    d.branch('holding', cond('var_photos', 'gte', 3), 'pay', 'looking')
    d.line('pay', 'Three photos of that wall-crawling menace! Grainy, blurry, perfect. Here is your money, do not spend it on web fluid.', 'pay_take')
    d.set('pay_take', 'var_photos', -3, 'pay2', op='add')
    d.set('pay2', 'var_photos_sold', True, 'end')
    d.line('looking', 'Three photos! From the ROOFS, where the menace hangs out. Buzz roof, Apartments roof, Grand Hotel roof. Chop chop!', 'end')
    d.line('hello', 'You! Kid! You look like you own a camera. The Daily Buzz pays for pictures of the masked menace. Three good ones, taken from the rooftops.', 'choice')
    d.choice('choice', None, [("I'll get them.", 'job'), ('He is not a menace.', 'menace')])
    d.action('job', start_quest('qst_photos'), 'job_flag')
    d.set('job_flag', 'var_photos_started', True, 'job2')
    d.line('job2', 'Buzz roof, Apartments roof, Grand Hotel roof. Someone left cameras up there. Do not ask me how I know.', 'end')
    d.line('menace', 'Everybody in a mask is a menace until proven otherwise. That is journalism. Photos, kid!', 'end')
    d.end()
    out[d.id] = d.build()

    d = DialogueBuilder('dlg_miles', 'Miles', 'Miles', portraits[KID])
    d.branch('free', cond('var_rescued', 'eq', True), 'freed', 'tied')
    d.line('freed', 'You are the coolest person alive. Can you teach me the wall thing? No? Later? OK later.', 'end')
    d.line('tied', 'You came! They tied me up here because I saw them carry crates into the warehouse. There is a big guy inside. Get me out of these ropes!', 'untie')
    d.set('untie', 'var_rescued', True, 'untie2')
    d.line('untie2', 'Thanks! I am going straight home. Well. Straight to the park. Then home.', 'end')
    d.end()
    out[d.id] = d.build()
    return out


def build_quests() -> dict[str, dict]:
    money = lambda n: add_var(MONEY, n)
    xp = lambda n: add_var(XP, n)
    out = [
        quest('qst_power', 'With Great Power', 'First day in the mask. Talk to Aunt Mae on the stoop, get onto your own rooftop (walk into the wall, or press X at it), then deal with the thug in the alley.',
              [('mae', 'Talk to Aunt Mae by the front door', cond('var_met_mae', 'eq', True)),
               ('roof', 'Get onto your rooftop (walk into the wall or press X at it)', cond('var_discovered_roof', 'eq', True)),
               ('thug', 'Web and defeat the thug in the alley (X, then Space)', cond('var_alley_thug', 'eq', True))],
              [xp(50), add_var(REP, 1), notify('With Great Power: +50 XP  +1 reputation', 'reward'), play('celebrate')]),
        quest('qst_purse', 'Purse Snatcher', "A thug ran off with Rosa's purse into the alley behind the flower market. Take it back.",
              [('thug', 'Defeat the purse snatcher in the market alley', cond('var_purse', 'gte', 1)),
               ('return', 'Return the purse to Rosa', cond('var_purse_returned', 'eq', True))],
              [money(25), xp(40), add_var(REP, 1), notify('Purse Snatcher done: +$25  +40 XP  +1 reputation', 'reward'), play('celebrate')]),
        quest('qst_bank', 'Bank Job', 'Three thugs are robbing the City Bank, south of Main across Park Avenue. Stop them.',
              [('thugs', 'Defeat the three bank robbers', cond('var_bank_thugs', 'gte', 3))],
              [money(40), xp(80), add_var(REP, 1), notify('Bank Job done: +$40  +80 XP  +1 reputation', 'reward'), play('celebrate')]),
        quest('qst_pizza', 'Pizza Time', "Papa Ray's order goes to Mr. Delmar on the Grand Hotel roof (north-east) in sixty seconds. Use the rooftops.",
              [('deliver', 'Deliver to Mr. Delmar on the Grand Hotel roof', cond('var_pizza_delivered', 'eq', True))],
              [money(15), xp(30), notify('Pizza delivered hot: +$15  +30 XP', 'reward'), play('celebrate')],
              time_limit_ms=60_000, on_fail=[notify('Cold pizza. Ray is not paying for that.', 'warning'), set_var('var_pizza', 0)], repeatable=True),
        quest('qst_photos', 'Front Page', 'The Daily Buzz wants three photos of the masked menace. The cameras are on the Buzz, Apartments and Grand Hotel roofs.',
              [('collect', 'Collect three photos from the rooftops', cond('var_photos', 'gte', 3)),
               ('sell', 'Bring them to J. J. Jameson at the Daily Buzz', cond('var_photos_sold', 'eq', True))],
              [money(60), xp(60), notify('Front Page: +$60  +60 XP', 'reward'), play('celebrate')]),
        quest('qst_rescue', 'Rooftop Rescue', 'Miles is tied up on the warehouse roof (south-east) with two guards. Get up there and free him.',
              [('free', 'Free Miles on the warehouse roof', cond('var_rescued', 'eq', True))],
              [xp(70), add_var(REP, 1), notify('Rooftop Rescue: +70 XP  +1 reputation', 'reward'), play('celebrate')]),
        quest('qst_showdown', 'Warehouse Showdown', 'The Enforcer runs the thugs from the warehouse. Earn 3 reputation to get the door open, then take him down inside.',
              [('rep', 'Earn 3 reputation (help people around downtown)', cond(REP, 'gte', 3)),
               ('boss', 'Defeat the Enforcer in the warehouse', cond('var_enforcer_down', 'eq', True))],
              [money(100), xp(200), add_var(REP, 1), notify('Warehouse Showdown: +$100  +200 XP. Downtown sleeps easier tonight.', 'reward'), play('celebrate')]),
    ]
    return {q['id']: q for q in out}


# ----------------------------------------------------------------------------------------------------------------
# Assembly


def main() -> int:
    manifest = H.load_json(H.MANIFEST)
    pack = H.load_json(PACK)
    by_id = {t['id']: t for t in manifest['tilesets'] + pack.get('tilesets', [])}
    for tid in (OUTDOOR, CITY, ROOF):
        if tid not in by_id:
            fail(f'no tileset {tid} (run `pnpm starter` and `node scripts/art/render.mjs --pack webslinger`)')
    city = json.loads(json.dumps(by_id[CITY]))
    # This project's copy of the City tileset: roofs and walls are climbable, so the small stamp buildings can be scaled too.
    for local, p in city['tileProperties'].items():
        tag = p.get('tag', '')
        if p.get('solid') and (tag.startswith('roof') or tag.startswith('wall') or tag.startswith('kiosk') or tag.startswith('shelter')):
            p['climbable'] = True
    tilesets = [by_id[OUTDOOR], city, by_id[ROOF]]
    tiles = ClimbTiles(tilesets)
    for tag in OUTDOOR_TAGS + CITY_TAGS + ROOF_TAGS:
        tiles.gid(tag)
    for tid, names in STAMPS.items():
        for name in names:
            stamp, first = tiles.stamp(name)
            if first != next(r['firstGid'] for r in tiles.refs if r['tilesetId'] == tid):
                fail(f'stamp {name!r} is not in {tid}')

    chars = {c['id']: c for c in manifest['characters'] + pack['characters']}
    for cid in (HERO, THUG, BOSS, VENDOR, BANKER, KID, VILLAGER):
        if cid not in chars:
            fail(f'no character {cid} in the manifest or the pack')
    for name in ('celebrate', 'web_down', 'web_up', 'web_left', 'web_right'):
        if name not in chars[HERO]['animations']:
            fail(f'{HERO} lacks the {name!r} animation')
    characters = {cid: chars[cid] for cid in (HERO, THUG, BOSS, VENDOR, BANKER, KID, VILLAGER)}
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

    V = Variables()
    V.stat(MONEY, 'money', 20, 'Money'); V.stat(XP, 'xp', 0, 'XP'); V.stat(REP, 'reputation', 0, 'Reputation')
    V.stat('var_bank_thugs', 'bank_thugs', 0, 'Bank robbers stopped')
    V.item('var_purse', 'purse', "Rosa's purse"); V.item('var_pizza', 'pizza', "Papa Ray's pizza"); V.item('var_photos', 'photos', 'Photos')
    for key, label in (('mae', 'Aunt Mae'), ('ray', 'Papa Ray')):
        V.flag(f'var_met_{key}', f'met_{key}', f'Met {label}')
    V.flag('var_alley_thug', 'alley_thug', 'Alley thug beaten')
    V.flag('var_purse_started', 'purse_started', 'Purse Snatcher started'); V.flag('var_purse_returned', 'purse_returned', 'Purse returned')
    V.flag('var_bank_started', 'bank_started', 'Bank Job started')
    V.flag('var_pizza_delivered', 'pizza_delivered', 'Pizza delivered')
    V.flag('var_photos_started', 'photos_started', 'Front Page started'); V.flag('var_photos_sold', 'photos_sold', 'Photos sold')
    V.flag('var_rescue_started', 'rescue_started', 'Rooftop Rescue started'); V.flag('var_rescued', 'rescued', 'Miles rescued')
    V.flag('var_enforcer_down', 'enforcer_down', 'Enforcer defeated')

    wh_map, wh_scene = build_warehouse(tiles, characters, {'x': 0, 'y': 0})
    city_map, city_scene = build_downtown(tiles, characters, V, wh_scene.spawn(9, 9, 'up'))
    wh_map, wh_scene = build_warehouse(tiles, characters, city_scene.spawn(53, 39, 'down'))

    doc = {
        'schemaVersion': 4,
        'id': 'prj_webslinger',
        'name': 'Webslinger',
        'settings': {
            'title': 'Webslinger',
            'viewport': {'width': 480, 'height': 270},
            'tileSize': T,
            'pixelArt': True,
            'defaultMoveSpeed': 110,
            'interactKey': 'E',
            'attackKey': 'SPACE',
            'abilityKey': 'X',
            'runSpeedMultiplier': 1.7,
            'backgroundColor': '#141626',
            'economy': {
                'moneyVariableId': MONEY, 'xpVariableId': XP, 'reputationVariableId': REP,
                'currencyPrefix': '$', 'dayLengthMs': 150_000,
                'levelThresholds': [80, 200, 400, 700, 1100, 1600],
            },
        },
        'startSceneId': CITY_SCENE,
        'assets': assets,
        'tilesets': {t['id']: t for t in tilesets},
        'maps': {m.id: m.build() for m in (city_map, wh_map)},
        'characters': characters,
        'scenes': {s.id: s.build() for s in (city_scene, wh_scene)},
        'dialogues': build_dialogues(portraits),
        'quests': build_quests(),
        'variables': V.table,
        'meta': {'createdAt': NOW, 'updatedAt': NOW, 'generator': GENERATOR},
    }
    for m in doc['maps'].values():
        for layer in m['layers']:
            assert all(0 <= g <= tiles.max_gid for g in layer['data']), m['id']
        assert set(m['collision']) <= {0, 1, 2}, m['id']
    H.verify(doc, hero=HERO)

    text = dumps(doc) + '\n'
    if len(text.encode('utf-8')) > 2 * 1024 * 1024:
        fail('document exceeds the 2 MB limit')
    for path in OUTPUTS:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'wrote {os.path.relpath(path, ROOT)}')
    city_doc = doc['scenes'][CITY_SCENE]
    col = doc['maps']['map_downtown']['collision']
    print(f'downtown: {len(city_doc["entities"])} entities, {col.count(1)} solid + {col.count(2)} climbable cells; '
          f'{len(doc["dialogues"])} dialogues, {len(doc["quests"])} quests, {len(doc["variables"])} variables, {len(text)} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
