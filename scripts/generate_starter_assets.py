#!/usr/bin/env python3
"""Generates the CC0 starter pack: one tileset, two character sheets, two portraits, and a
manifest that @beze/project-core's createProject consumes. Pure Python, no dependencies.

Sheet layout (Beze Character Sheet v1): 4 rows (down, left, right, up) x 4 columns of
32x48 frames. Frame 0 of each row is the idle pose; frames 0-3 form the walk cycle.
"""
from __future__ import annotations
import hashlib, json, os, struct, zlib

ROOT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'editor', 'public', 'starter')
os.makedirs(ROOT, exist_ok=True)

class Image:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.px = bytearray(w * h * 4)

    def put(self, x: int, y: int, c: tuple[int, int, int, int]):
        if 0 <= x < self.w and 0 <= y < self.h and c[3] > 0:
            i = (y * self.w + x) * 4
            self.px[i:i + 4] = bytes(c)

    def rect(self, x: int, y: int, w: int, h: int, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, c):
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1:
                    self.put(xx, yy, c)

    def png(self) -> bytes:
        raw = b''.join(b'\x00' + bytes(self.px[y * self.w * 4:(y + 1) * self.w * 4]) for y in range(self.h))
        def chunk(t: bytes, d: bytes) -> bytes:
            return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', self.w, self.h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def rgba(h: str, a: int = 255):
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

# deterministic pseudo-random for speckles
def noise(x: int, y: int, salt: int = 0) -> int:
    return (x * 73856093 ^ y * 19349663 ^ salt * 83492791) & 0xffff

# ---------------------------------------------------------------- tileset
T = 32
GRASS, GRASS_D, PATH, PATH_D, TRUNK, LEAF, LEAF_D, WATER, WATER_L = (
    rgba('5fb35a'), rgba('4f9a4b'), rgba('cbb279'), rgba('b59d63'), rgba('6b4a2b'), rgba('2f7a3a'), rgba('245f2d'), rgba('4a90d9'), rgba('7fb6ec'))

tiles = Image(T * 4, T)
def grass(ox: int):
    tiles.rect(ox, 0, T, T, GRASS)
    for y in range(T):
        for x in range(T):
            if noise(x + ox, y) % 11 == 0:
                tiles.put(ox + x, y, GRASS_D)
grass(0)
# path
tiles.rect(T, 0, T, T, PATH)
for y in range(T):
    for x in range(T):
        if noise(x, y, 3) % 9 == 0:
            tiles.put(T + x, y, PATH_D)
# tree on grass
grass(2 * T)
tiles.rect(2 * T + 13, 20, 6, 11, TRUNK)
tiles.ellipse(2 * T + 16, 13, 13, 12, LEAF)
tiles.ellipse(2 * T + 13, 10, 7, 6, rgba('3c9a4a'))
for y in range(T):
    for x in range(T):
        if noise(x, y, 5) % 13 == 0 and ((x - 16) / 13) ** 2 + ((y - 13) / 12) ** 2 <= 1:
            tiles.put(2 * T + x, y, LEAF_D)
# water
tiles.rect(3 * T, 0, T, T, WATER)
for y in range(T):
    for x in range(T):
        if (x + y * 3) % 16 in (0, 1) and y % 8 in (2, 3):
            tiles.put(3 * T + x, y, WATER_L)

# ---------------------------------------------------------------- characters
FW, FH = 32, 48
SKIN, SKIN_D, OUTLINE, EYE, WHITE = rgba('ffe0c4'), rgba('e8b894'), rgba('2b2233'), rgba('3a2a5a'), rgba('ffffff')

def draw_character(img: Image, ox: int, oy: int, facing: str, frame: int, hair, hair_d, coat, coat_d, pants, accent):
    """Chibi figure, ~26px tall inside a 32x48 frame, feet at the bottom."""
    bob = 1 if frame in (1, 3) else 0
    cx = ox + 16
    top = oy + 14 - bob
    # legs (walk cycle swings frames 1 and 3)
    leg_l = leg_r = 0
    if frame == 1: leg_l, leg_r = -2, 2
    if frame == 3: leg_l, leg_r = 2, -2
    if facing in ('left', 'right'):
        img.rect(cx - 5, oy + 38 + bob, 4, 8 - abs(leg_l) // 2, pants)
        img.rect(cx + 1, oy + 38 + bob, 4, 8 - abs(leg_r) // 2, pants)
        img.rect(cx - 6 + (leg_l if facing == 'left' else -leg_l), oy + 44, 5, 3, OUTLINE)
        img.rect(cx + 1 + (leg_r if facing == 'left' else -leg_r), oy + 44, 5, 3, OUTLINE)
    else:
        img.rect(cx - 6, oy + 38 + bob, 5, 8 - abs(leg_l) // 2, pants)
        img.rect(cx + 1, oy + 38 + bob, 5, 8 - abs(leg_r) // 2, pants)
        img.rect(cx - 7, oy + 44 + (leg_l > 0), 6, 3, OUTLINE)
        img.rect(cx + 1, oy + 44 + (leg_r > 0), 6, 3, OUTLINE)
    # body / coat
    img.rect(cx - 8, top + 14, 16, 12, coat)
    img.rect(cx - 8, top + 14, 16, 1, coat_d)
    if facing == 'down':
        img.rect(cx - 1, top + 15, 2, 10, accent)
    if facing in ('left', 'right'):
        img.rect(cx - 6, top + 14, 12, 12, coat)
    # arms
    arm = 1 if frame in (1, 3) else 0
    if facing in ('down', 'up'):
        img.rect(cx - 11, top + 15 + arm, 3, 9, coat_d)
        img.rect(cx + 8, top + 15 - arm, 3, 9, coat_d)
        img.rect(cx - 11, top + 24 + arm, 3, 2, SKIN)
        img.rect(cx + 8, top + 24 - arm, 3, 2, SKIN)
    else:
        img.rect(cx - 2, top + 16 + arm, 4, 9, coat_d)
        img.rect(cx - 2, top + 25 + arm, 4, 2, SKIN)
    # head
    img.ellipse(cx, top + 7, 9, 8, SKIN)
    img.rect(cx - 9, top + 9, 18, 5, SKIN)
    # hair
    if facing == 'up':
        img.ellipse(cx, top + 6, 10, 8, hair)
        img.rect(cx - 10, top + 6, 20, 8, hair)
        img.rect(cx - 8, top + 13, 16, 2, hair_d)
    else:
        img.ellipse(cx, top + 5, 10, 7, hair)
        img.rect(cx - 10, top + 5, 20, 4, hair)
        img.rect(cx - 10, top + 9, 3, 6, hair)
        img.rect(cx + 7, top + 9, 3, 6, hair)
        img.rect(cx - 10, top + 8, 20, 1, hair_d)
        if facing == 'left':
            img.rect(cx - 10, top + 9, 4, 8, hair)
        if facing == 'right':
            img.rect(cx + 6, top + 9, 4, 8, hair)
    # eyes
    if facing == 'down':
        img.rect(cx - 5, top + 10, 2, 3, EYE); img.rect(cx + 3, top + 10, 2, 3, EYE)
        img.put(cx - 5, top + 10, WHITE); img.put(cx + 3, top + 10, WHITE)
        img.rect(cx - 6, top + 14, 3, 1, SKIN_D); img.rect(cx + 3, top + 14, 3, 1, SKIN_D)
    elif facing == 'left':
        img.rect(cx - 6, top + 10, 2, 3, EYE); img.put(cx - 6, top + 10, WHITE)
    elif facing == 'right':
        img.rect(cx + 4, top + 10, 2, 3, EYE); img.put(cx + 5, top + 10, WHITE)

def sheet(hair, hair_d, coat, coat_d, pants, accent) -> Image:
    img = Image(FW * 4, FH * 4)
    for row, facing in enumerate(('down', 'left', 'right', 'up')):
        for frame in range(4):
            draw_character(img, frame * FW, row * FH, facing, frame, hair, hair_d, coat, coat_d, pants, accent)
    return img

def portrait(hair, hair_d, coat, accent, eye) -> Image:
    img = Image(256, 256)
    img.ellipse(128, 300, 120, 90, coat)               # shoulders
    img.rect(120, 150, 16, 60, SKIN)                     # neck
    img.ellipse(128, 120, 78, 84, SKIN)                  # face
    img.ellipse(128, 86, 88, 62, hair)                   # hair top
    img.rect(40, 86, 176, 40, hair)
    img.rect(40, 120, 26, 90, hair); img.rect(190, 120, 26, 90, hair)
    img.rect(52, 116, 152, 6, hair_d)
    for sx in (92, 148):                                 # eyes
        img.ellipse(sx + 8, 136, 12, 16, WHITE)
        img.ellipse(sx + 9, 138, 8, 12, eye)
        img.ellipse(sx + 6, 132, 3, 4, WHITE)
        img.rect(sx - 4, 116, 26, 4, hair_d)             # brows
    img.ellipse(128, 176, 10, 4, rgba('c0605f'))         # mouth
    img.ellipse(80, 160, 10, 5, rgba('ffb3b3', 140)); img.ellipse(176, 160, 10, 5, rgba('ffb3b3', 140))
    img.rect(120, 200, 16, 40, accent)
    return img

hero = sheet(rgba('f2f2f2'), rgba('c9c9d4'), rgba('23212b'), rgba('141319'), rgba('2c2c3a'), rgba('c8102e'))
villager = sheet(rgba('6b3e2e'), rgba('4d2a1f'), rgba('d94f6b'), rgba('a83a52'), rgba('f2e6d8'), rgba('f6d365'))
hero_portrait = portrait(rgba('f2f2f2'), rgba('c9c9d4'), rgba('23212b'), rgba('c8102e'), rgba('6a8fd8'))
villager_portrait = portrait(rgba('6b3e2e'), rgba('4d2a1f'), rgba('d94f6b'), rgba('f6d365'), rgba('7a4b2e'))

files = {
    'tileset.png': tiles, 'hero.png': hero, 'villager.png': villager,
    'hero_portrait.png': hero_portrait, 'villager_portrait.png': villager_portrait,
}
hashes: dict[str, str] = {}
for name, img in files.items():
    data = img.png()
    with open(os.path.join(ROOT, name), 'wb') as f:
        f.write(data)
    hashes[name] = hashlib.sha256(data).hexdigest()

ANIMS = {
    'idle_down': [0], 'walk_down': [0, 1, 2, 3],
    'idle_left': [4], 'walk_left': [4, 5, 6, 7],
    'idle_right': [8], 'walk_right': [8, 9, 10, 11],
    'idle_up': [12], 'walk_up': [12, 13, 14, 15],
}
def animations():
    return {k: {'frames': v, 'frameRate': 1 if k.startswith('idle') else 8, 'loop': not k.startswith('idle')} for k, v in ANIMS.items()}

def asset(aid, name, file, w, h):
    return {'id': aid, 'kind': 'image', 'name': name, 'mime': 'image/png', 'width': w, 'height': h,
            'hash': hashes[file], 'origin': 'starter', 'license': 'CC0-1.0'}

manifest = {
    'files': {
        'ast_starter_tileset': 'tileset.png', 'ast_starter_hero': 'hero.png', 'ast_starter_villager': 'villager.png',
        'ast_starter_hero_portrait': 'hero_portrait.png', 'ast_starter_villager_portrait': 'villager_portrait.png',
    },
    'assets': [
        asset('ast_starter_tileset', 'Outdoor tileset', 'tileset.png', T * 4, T),
        asset('ast_starter_hero', 'Hero sheet', 'hero.png', FW * 4, FH * 4),
        asset('ast_starter_villager', 'Villager sheet', 'villager.png', FW * 4, FH * 4),
        asset('ast_starter_hero_portrait', 'Hero portrait', 'hero_portrait.png', 256, 256),
        asset('ast_starter_villager_portrait', 'Villager portrait', 'villager_portrait.png', 256, 256),
    ],
    'tilesets': [{
        'id': 'tls_outdoor', 'name': 'Outdoor', 'imageAssetId': 'ast_starter_tileset',
        'tileWidth': T, 'tileHeight': T, 'columns': 4, 'tileCount': 4, 'margin': 0, 'spacing': 0,
        'tileProperties': {'2': {'solid': True, 'tag': 'tree'}, '3': {'solid': True, 'tag': 'water'}},
    }],
    'characters': [
        {'id': 'chr_hero', 'name': 'Hero', 'spriteSheetAssetId': 'ast_starter_hero', 'frameWidth': FW, 'frameHeight': FH,
         'animations': animations(), 'collider': {'width': 20, 'height': 16, 'offsetX': 6, 'offsetY': 32},
         'portraitAssetId': 'ast_starter_hero_portrait'},
        {'id': 'chr_villager', 'name': 'Villager', 'spriteSheetAssetId': 'ast_starter_villager', 'frameWidth': FW, 'frameHeight': FH,
         'animations': animations(), 'collider': {'width': 20, 'height': 16, 'offsetX': 6, 'offsetY': 32},
         'portraitAssetId': 'ast_starter_villager_portrait'},
    ],
    'groundGid': 1,
    'playerCharacterId': 'chr_hero',
}
with open(os.path.join(ROOT, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
with open(os.path.join(ROOT, 'LICENSES.md'), 'w') as f:
    f.write('# Starter pack licences\n\nEvery file in this folder is generated by `scripts/generate_starter_assets.py` '
            'and released under CC0 1.0 (public domain). Regenerate with `pnpm starter`.\n')
print('ok', {k: v[:8] for k, v in hashes.items()})
