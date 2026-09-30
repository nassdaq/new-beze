# Starter art pipeline

Art is code: each character and tileset is a small browser-side ES module that draws with the
Canvas 2D API. `render.mjs` rasterises every module in headless Chromium into PNGs under
`apps/editor/public/starter/` and writes `manifest.json`, which `createProject` consumes.
No image libraries are needed and every asset is reproducible.

```sh
node scripts/art/render.mjs                 # render everything + manifest
node scripts/art/render.mjs --only hero     # one module (matches file name)
node scripts/art/render.mjs --preview DIR   # also write 4x upscaled previews to DIR for eyeballing
```

## Beze Character Sheet v2

- Frame size is the module's choice; the default is 48×64 px on 32 px tiles (a character is
  about two tiles tall, RPG-Maker-like proportions).
- The sheet has 4 columns and 8 rows. Row order:

| Row | Animation | Frames used |
|-----|-----------|-------------|
| 0 | walk_down | 0..3 (frame 0 is also idle_down) |
| 1 | walk_left | 0..3 |
| 2 | walk_right | 0..3 |
| 3 | walk_up | 0..3 |
| 4 | attack_down | 0..2 |
| 5 | attack_left | 0..2 |
| 6 | attack_right | 0..2 |
| 7 | attack_up | 0..2 |

- Frame index = row × 4 + column. `render.mjs` derives the `animations` table from this, so a
  module never writes frame numbers.
- **Emote rows (optional).** A module may export `emotes: [{ name: 'celebrate', frames: 3, frameRate: 6,
  loop: false }, ...]`. Each emote gets one extra row after row 7 (up to 4 frames, drawn with
  `f.anim === name`, `f.dir === 'down'`), and the manifest gains an animation with that name, playable
  through the `playAnimation` action. Typical names: `celebrate`, `map`, `point`, `phone`, `interact`.
- Feet must touch the bottom of the frame; the collider describes the feet footprint.
- Everything must be deterministic: no `Math.random()` (use the provided `rand(seed)`), so a
  re-render produces identical hashes.

## Character module contract (`scripts/art/characters/<name>.mjs`)

```js
export default {
  id: 'chr_hero',                  // character id used in projects
  name: 'Hero',
  role: 'player',                  // 'player' | 'npc' | 'enemy'  (one module has role 'player')
  assetId: 'ast_starter_hero',
  file: 'hero.png',
  frameWidth: 48, frameHeight: 64,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 8, attackFrameRate: 14,
  portrait: { assetId: 'ast_starter_hero_portrait', file: 'hero_portrait.png', size: 256 }, // or null
  /** Draw one frame at origin (0,0) inside frameWidth×frameHeight. */
  draw(ctx, f) {},                 // f = { anim: 'walk'|'attack', dir: 'down'|'left'|'right'|'up', index, count, w, h, rand }
  /** Optional. Draw a bust portrait at origin inside size×size. */
  drawPortrait(ctx, size) {},
};
```

`f.rand(n)` is a seeded PRNG (per frame) returning [0,1); `f.index / f.count` is the animation
phase. The renderer sets `ctx.imageSmoothingEnabled = false` and nothing else; modules own their
style. Use outlines, two-tone shading and highlights; treat it as drawing a character, not a
blob of rectangles.

## Tileset module contract (`scripts/art/tilesets/<name>.mjs`)

```js
export default {
  id: 'tls_outdoor', name: 'Outdoor', assetId: 'ast_starter_tileset', file: 'tileset.png',
  tileSize: 32, columns: 8,
  groundTag: 'grass',              // tile that fills a new map's ground layer
  tiles: [                          // index = position in the sheet, row-major
    { tag: 'grass', solid: false, draw(ctx, s, rand) {} },
    { tag: 'tree',  solid: true,  draw(ctx, s, rand) {} },
    ...
  ],
  stamps: [                         // optional: multi-tile objects painted in one click
    { name: 'Tree', tags: [['tree_top'], ['tree']], above: [[true], [false]] },
  ],
};
```

Tags are free text but `grass`, `path`, `tree`, `water` must exist (the golden fixture and the
AI prompts use them). Solid tiles become collision when the editor paints with auto-collision.

### Stamps (multi-tile objects)

A stamp is a small grid of tiles the editor paints in one click (a two-tile tree, a 2×2 house).
`tags` is a list of rows, each row a list of tags (`null` for an empty cell), at most 8×8. The
optional `above` has the same shape: cells flagged `true` are drawn over characters (canopies,
roofs), so the editor paints them on the topmost layer that has `aboveEntities` and the player
walks behind them; the other cells go on the active layer. Rows may be ragged; the stamp's width
is the longest row and missing cells are empty.

`render.mjs` resolves tags to local tile indices and writes, into the tileset's manifest entry,
`stamps: [{ name, width, height, tiles, above }]` with `tiles` row-major and `-1` for an empty
cell, which is exactly `TileStampSchema` in `packages/project-schema`. A tag that no tile carries
fails the render. Objects that span two tiles must be drawn as one image: render the whole
object into an offscreen canvas once and blit its halves into the tiles (see `drawTree` in
`tilesets/outdoor.mjs`), so the seam between the tiles is invisible on the map.
