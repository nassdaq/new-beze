#!/usr/bin/env python3
"""Rebuilds the golden fixture docs/examples/hello-aiko.project.json from the starter pack.

Reads apps/editor/public/starter/manifest.json (written by `pnpm starter`, i.e. scripts/art/render.mjs)
so the fixture's assets, tilesets and characters always match the rendered art, then lays out the
"Hello, Aiko" village by hand: a grass map with a path cross, a tree border painted with the manifest's
Tree/Pine stamps (trunks on Decoration with collision, crowns on the Canopy layer drawn over characters),
a pond, and five entities (the hero, Aiko, a slime, a bat and a rideable horse). Pure Python 3, no dependencies.

    python3 scripts/generate_fixture.py
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MANIFEST = os.path.join(ROOT, 'apps', 'editor', 'public', 'starter', 'manifest.json')
OUT = os.path.join(ROOT, 'docs', 'examples', 'hello-aiko.project.json')

W, H, T = 20, 15, 32
TILESET_ID = 'tls_outdoor'
FIRST_GID = 1
NOW = '2026-09-29T00:00:00.000Z'

# Preferred listing order for the collections copied from the manifest (anything else follows).
CHARACTER_ORDER = ['chr_hero', 'chr_villager', 'chr_slime', 'chr_bat', 'chr_horse', 'chr_hero_mounted']
ASSET_ORDER = ['ast_starter_tileset', 'ast_starter_hero', 'ast_starter_hero_portrait', 'ast_starter_villager',
               'ast_starter_villager_portrait', 'ast_starter_slime', 'ast_starter_bat', 'ast_starter_horse',
               'ast_starter_hero_mounted']


def ordered(items: list[dict], order: list[str]) -> dict[str, dict]:
    rank = {id_: i for i, id_ in enumerate(order)}
    return {it['id']: it for it in sorted(items, key=lambda it: (rank.get(it['id'], len(order)), it['id']))}


def main() -> int:
    with open(MANIFEST, encoding='utf-8') as f:
        manifest = json.load(f)

    tileset = next((t for t in manifest['tilesets'] if t['id'] == TILESET_ID), None)
    if tileset is None:
        sys.exit(f'manifest has no tileset {TILESET_ID}')
    props: dict[str, dict] = tileset['tileProperties']
    by_tag = {p['tag']: int(local) for local, p in props.items() if 'tag' in p}
    solid_gids = {FIRST_GID + int(local) for local, p in props.items() if p.get('solid')}

    def gid(tag: str) -> int:
        if tag not in by_tag:
            sys.exit(f'tileset {TILESET_ID} has no tile tagged {tag!r}')
        return FIRST_GID + by_tag[tag]

    def opt_gid(tag: str) -> int | None:
        return FIRST_GID + by_tag[tag] if tag in by_tag else None

    def idx(x: int, y: int) -> int:
        return y * W + x

    # --- Ground: grass with a path cross (row 8 / column 10) and edge tiles along the path sides.
    PATH_ROW, PATH_COL = 8, 10
    ground = [gid('grass')] * (W * H)
    edge = {side: opt_gid(f'path_edge_{side}') for side in ('n', 's', 'w', 'e')}
    for y in range(H):
        if edge['w'] is not None:
            ground[idx(PATH_COL - 1, y)] = edge['w']
        if edge['e'] is not None:
            ground[idx(PATH_COL + 1, y)] = edge['e']
    for x in range(W):
        if x == PATH_COL:
            continue
        if edge['n'] is not None:
            ground[idx(x, PATH_ROW - 1)] = edge['n']
        if edge['s'] is not None:
            ground[idx(x, PATH_ROW + 1)] = edge['s']
    for x in range(W):
        ground[idx(x, PATH_ROW)] = gid('path')
    for y in range(H):
        ground[idx(PATH_COL, y)] = gid('path')
    # Inside corners of the crossing; without corner tiles the north/south edge stands in.
    for (dx, dy, corner) in ((-1, -1, 'nw'), (1, -1, 'ne'), (-1, 1, 'sw'), (1, 1, 'se')):
        g = opt_gid(f'path_corner_{corner}')
        if g is not None:
            ground[idx(PATH_COL + dx, PATH_ROW + dy)] = g

    # --- Decoration + Canopy: a tree border of whole trees, alternating the Tree and Pine stamps.
    # A stamp's trunk cell (solid) lands on Decoration, its crown (flagged `above`) on Canopy, which is
    # drawn over characters. Trunks sit on row 1, row H-1 and columns 0 / W-1; crowns one tile above,
    # so row 0 holds only crowns and every tree is whole.
    stamps = {s['name']: s for s in tileset.get('stamps', [])}
    for name in ('Tree', 'Pine'):
        if name not in stamps:
            sys.exit(f'tileset {TILESET_ID} has no stamp {name!r}; re-render the starter art (pnpm starter)')
    deco = [0] * (W * H)
    canopy = [0] * (W * H)

    def stamp_at(stamp: dict, ax: int, ay: int) -> None:
        """Paints `stamp` with its top-left cell at (ax, ay); cells outside the map are dropped."""
        w = stamp['width']
        above = stamp.get('above') or [False] * len(stamp['tiles'])
        for i, local in enumerate(stamp['tiles']):
            if local < 0:
                continue
            x, y = ax + i % w, ay + i // w
            if 0 <= x < W and 0 <= y < H:
                (canopy if above[i] else deco)[idx(x, y)] = FIRST_GID + local

    border = [(x, 1) for x in range(W)] + [(x, H - 1) for x in range(W)] \
        + [(0, y) for y in range(2, H - 1)] + [(W - 1, y) for y in range(2, H - 1)]
    for (x, y) in border:  # (x, y) is the trunk cell
        stamp = stamps['Tree'] if (x + y) % 2 == 0 else stamps['Pine']
        stamp_at(stamp, x, y - stamp['height'] + 1)
    # A 3x2 pond: shore tiles around the rim when the tileset has them, plain water otherwise.
    POND_X, POND_Y, POND_W, POND_H = 3, 3, 3, 2
    for y in range(POND_Y, POND_Y + POND_H):
        for x in range(POND_X, POND_X + POND_W):
            top, bottom = y == POND_Y, y == POND_Y + POND_H - 1
            left, right = x == POND_X, x == POND_X + POND_W - 1
            v = 'n' if top else 's' if bottom else ''
            h = 'w' if left else 'e' if right else ''
            tag = f'water_corner_{v}{h}' if (v and h) else f'water_edge_{v or h}' if (v or h) else 'water'
            deco[idx(x, y)] = opt_gid(tag) or gid('water')
    props_layout = {
        'flowers': [(2, 6), (7, 2), (14, 12), (17, 6), (6, 10)],
        'bush': [(17, 10), (2, 12), (13, 3)],
        'rock': [(7, 12), (17, 2)],
    }
    for tag, cells in props_layout.items():
        for (x, y) in cells:
            assert deco[idx(x, y)] == 0 and ground[idx(x, y)] == gid('grass'), (tag, x, y)
            deco[idx(x, y)] = gid(tag)

    # --- Collision: every cell whose ground or decoration tile is solid (canopy tiles are never solid).
    collision = [1 if (ground[i] in solid_gids or deco[i] in solid_gids) else 0 for i in range(W * H)]

    characters = ordered(manifest['characters'], CHARACTER_ORDER)
    assets = ordered(manifest['assets'], ASSET_ORDER)
    tilesets = {t['id']: t for t in manifest['tilesets']}
    for cid in ('chr_hero', 'chr_villager', 'chr_slime', 'chr_bat', 'chr_horse', 'chr_hero_mounted'):
        if cid not in characters:
            sys.exit(f'manifest has no character {cid}')
    if manifest.get('playerCharacterId') != 'chr_hero':
        sys.exit(f"manifest playerCharacterId is {manifest.get('playerCharacterId')!r}, expected 'chr_hero'")

    def feet_y(ty: int, character_id: str) -> int:
        c = characters[character_id]['collider']
        return ty * T + T - (c['offsetY'] + c['height'])

    def entity(id_: str, name: str, character_id: str, tx: int, ty: int, facing: str, components: list[dict]) -> dict:
        assert collision[idx(tx, ty)] == 0, f'{id_} stands on a solid tile ({tx}, {ty})'
        return {
            'id': id_, 'name': name, 'x': tx * T, 'y': feet_y(ty, character_id), 'facing': facing,
            'components': [{'type': 'sprite', 'characterId': character_id}, {'type': 'body', 'solid': True}, *components],
        }

    def add_defeated() -> dict:
        return {'type': 'setVariable', 'variableId': 'var_slimes_defeated', 'op': 'add', 'value': 1}

    entities = {
        'ent_hero': entity('ent_hero', 'Hero', 'chr_hero', 10, 12, 'up', [
            {'type': 'playerControl', 'attackDamage': 1},
            {'type': 'health', 'max': 3},
        ]),
        'ent_aiko': entity('ent_aiko', 'Aiko', 'chr_villager', 12, 8, 'down', [
            {'type': 'interactable', 'action': {'type': 'startDialogue', 'dialogueId': 'dlg_aiko_intro'}, 'prompt': 'Talk'},
        ]),
        'ent_slime': entity('ent_slime', 'Slime', 'chr_slime', 15, 4, 'down', [
            {'type': 'wander', 'radius': 64, 'speed': 24},
            {'type': 'health', 'max': 2},
            {'type': 'enemy', 'speed': 56, 'aggroRadius': 120, 'damage': 1, 'attackCooldownMs': 800, 'onDefeat': add_defeated()},
        ]),
        'ent_bat': entity('ent_bat', 'Bat', 'chr_bat', 4, 11, 'down', [
            {'type': 'wander', 'radius': 96, 'speed': 40},
            {'type': 'health', 'max': 1},
            {'type': 'enemy', 'speed': 80, 'aggroRadius': 140, 'damage': 1, 'attackCooldownMs': 1000, 'onDefeat': add_defeated()},
        ]),
        # Press E on the horse to ride it: the player swaps to the mounted hero (faster) and the horse
        # entity is removed; pressing E again with nothing in front dismounts (runtime behaviour).
        'ent_horse': entity('ent_horse', 'Horse', 'chr_horse', 6, 11, 'left', [
            {'type': 'wander', 'radius': 48, 'speed': 20},
            {'type': 'interactable', 'prompt': 'Ride', 'action': {'type': 'sequence', 'actions': [
                {'type': 'setPlayerCharacter', 'characterId': 'chr_hero_mounted', 'speed': 220},
                {'type': 'removeEntity', 'entityId': 'ent_horse'},
            ]}},
        ]),
    }

    portrait = characters['chr_villager'].get('portraitAssetId', 'ast_starter_villager_portrait')
    dialogue = {
        'id': 'dlg_aiko_intro', 'name': 'Aiko intro', 'startNodeId': 'nod_check',
        'nodes': {
            'nod_check': {'id': 'nod_check', 'type': 'branch',
                          'condition': {'variableId': 'var_met_aiko', 'op': 'eq', 'value': True},
                          'ifTrue': 'nod_again', 'ifFalse': 'nod_hello'},
            'nod_hello': {'id': 'nod_hello', 'type': 'line', 'speaker': 'Aiko', 'portraitAssetId': portrait,
                          'text': "Oh! A traveller. We don't get many out here. I'm Aiko.", 'next': 'nod_choice'},
            'nod_choice': {'id': 'nod_choice', 'type': 'choice', 'prompt': 'What do you say?',
                           'options': [{'text': 'Nice to meet you, Aiko.', 'next': 'nod_nice'},
                                       {'text': 'Just passing through.', 'next': 'nod_passing'}]},
            'nod_nice': {'id': 'nod_nice', 'type': 'line', 'speaker': 'Aiko', 'portraitAssetId': portrait,
                         'text': 'Likewise! Mind the pond, the frogs bite.', 'next': 'nod_set'},
            'nod_passing': {'id': 'nod_passing', 'type': 'line', 'speaker': 'Aiko', 'portraitAssetId': portrait,
                            'text': 'Everyone is, these days. Safe travels.', 'next': 'nod_set'},
            'nod_set': {'id': 'nod_set', 'type': 'set', 'variableId': 'var_met_aiko', 'op': 'set', 'value': True, 'next': 'nod_end'},
            'nod_again': {'id': 'nod_again', 'type': 'line', 'speaker': 'Aiko', 'portraitAssetId': portrait,
                          'text': 'Back again? The frogs are still biting.', 'next': 'nod_end'},
            'nod_end': {'id': 'nod_end', 'type': 'end'},
        },
    }

    doc = {
        'schemaVersion': 2,
        'id': 'prj_hello_aiko',
        'name': 'Hello, Aiko',
        'settings': {
            'title': 'Hello, Aiko',
            'viewport': {'width': 480, 'height': 270},
            'tileSize': T,
            'pixelArt': True,
            'defaultMoveSpeed': 96,
            'interactKey': 'E',
            'attackKey': 'SPACE',
            'backgroundColor': '#1a1a2e',
        },
        'startSceneId': 'scn_village',
        'assets': assets,
        'tilesets': tilesets,
        'maps': {
            'map_village': {
                'id': 'map_village', 'name': 'Village', 'width': W, 'height': H, 'tileWidth': T, 'tileHeight': T,
                'tilesets': [{'tilesetId': TILESET_ID, 'firstGid': FIRST_GID}],
                'layers': [
                    {'id': 'lyr_ground', 'name': 'Ground', 'visible': True, 'aboveEntities': False, 'data': ground},
                    {'id': 'lyr_deco', 'name': 'Decoration', 'visible': True, 'aboveEntities': False, 'data': deco},
                    {'id': 'lyr_canopy', 'name': 'Canopy', 'visible': True, 'aboveEntities': True, 'data': canopy},
                ],
                'collision': collision,
            }
        },
        'characters': characters,
        'scenes': {
            'scn_village': {
                'id': 'scn_village', 'name': 'Village', 'mapId': 'map_village',
                'entities': entities,
                'entityOrder': ['ent_hero', 'ent_aiko', 'ent_slime', 'ent_bat', 'ent_horse'],
            }
        },
        'dialogues': {'dlg_aiko_intro': dialogue},
        'quests': {},
        'variables': {
            'var_met_aiko': {'id': 'var_met_aiko', 'name': 'metAiko', 'type': 'boolean', 'initial': False},
            'var_slimes_defeated': {'id': 'var_slimes_defeated', 'name': 'slimesDefeated', 'type': 'number', 'initial': 0},
        },
        'meta': {'createdAt': NOW, 'updatedAt': NOW, 'generator': 'beze-docs/0.1'},
    }

    # Integrity checks mirroring validateProject.
    for m in doc['maps'].values():
        assert len(m['collision']) == m['width'] * m['height']
        for layer in m['layers']:
            assert len(layer['data']) == m['width'] * m['height']
            assert all(0 <= g <= FIRST_GID + tileset['tileCount'] - 1 for g in layer['data'])
    for d in doc['dialogues'].values():
        for n in d['nodes'].values():
            for key in ('next', 'ifTrue', 'ifFalse'):
                if n.get(key) is not None:
                    assert n[key] in d['nodes'], (n['id'], key)
            for o in n.get('options', []):
                assert o['next'] in d['nodes']
    for c in doc['characters'].values():
        assert c['spriteSheetAssetId'] in doc['assets'], c['id']
        if c.get('portraitAssetId'):
            assert c['portraitAssetId'] in doc['assets'], c['id']

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=2)
        f.write('\n')
    print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(entities)} entities, {sum(collision)} solid cells')
    return 0


if __name__ == '__main__':
    sys.exit(main())
