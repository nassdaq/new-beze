import { describe, expect, it } from 'vitest';
import {
  createImage, cropImage, detectGrid, detectGutters, detectTileSize, framesFloat, gridContradictsGutters, guessPreset,
  hasOpaqueCorners, maxBoxesPerRow, normalizeToGrid, presetAnimations, removeBackground, repack, suggestCellSize,
  suggestCollider, trimCells, type Box, type RGBAImage,
} from './sheetTools.js';

type RGBA = [number, number, number, number];

function fill(img: RGBAImage, color: RGBA): void {
  for (let i = 0; i < img.data.length; i += 4) img.data.set(color, i);
}

function rect(img: RGBAImage, x: number, y: number, w: number, h: number, color: RGBA): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.data.set(color, (yy * img.width + xx) * 4);
}

function px(img: RGBAImage, x: number, y: number): RGBA {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

const RED: RGBA = [200, 30, 30, 255];
const BLUE: RGBA = [30, 30, 200, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

/** A sheet of `cols`×`rows` cells of `fw`×`fh` with a sprite of `sw`×`sh` bottom-centred in each. */
function sheet(fw: number, fh: number, cols: number, rows: number, sw: number, sh: number, offset = 0): RGBAImage {
  const img = createImage(fw * cols, fh * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    rect(img, c * fw + Math.floor((fw - sw) / 2), r * fh + (fh - sh) - offset, sw, sh, r % 2 ? RED : BLUE);
  }
  return img;
}

describe('removeBackground', () => {
  it('makes the corner-connected background transparent and leaves the sprite', () => {
    const img = createImage(16, 16);
    fill(img, WHITE);
    rect(img, 4, 4, 8, 8, RED);
    const out = removeBackground(img, 20);
    expect(px(out, 0, 0)).toEqual(CLEAR);
    expect(px(out, 15, 15)).toEqual(CLEAR);
    expect(px(out, 3, 8)).toEqual(CLEAR);
    expect(px(out, 8, 8)).toEqual(RED);
    expect(px(out, 4, 4)).toEqual(RED); // edge pixel: far from white, no feathering
    // input untouched
    expect(px(img, 0, 0)).toEqual(WHITE);
  });

  it('respects the tolerance for slightly off-white pixels', () => {
    const img = createImage(8, 8);
    fill(img, WHITE);
    rect(img, 0, 0, 8, 4, [240, 240, 240, 255]);
    rect(img, 3, 3, 2, 2, BLUE);
    expect(px(removeBackground(img, 10), 0, 0)).toEqual(CLEAR); // corner seed is 240-grey: its own region goes
    expect(px(removeBackground(img, 10), 0, 6)).toEqual(CLEAR);
    expect(px(removeBackground(img, 10), 3, 3)).toEqual(BLUE);
  });

  it('does not eat enclosed regions of the background colour', () => {
    const img = createImage(12, 12);
    fill(img, WHITE);
    rect(img, 2, 2, 8, 8, RED);
    rect(img, 5, 5, 2, 2, WHITE); // white eyes inside the sprite
    const out = removeBackground(img, 20);
    expect(px(out, 5, 5)).toEqual(WHITE);
    expect(px(out, 0, 0)).toEqual(CLEAR);
  });

  it('is a no-op for already transparent sheets', () => {
    const img = createImage(8, 8);
    rect(img, 2, 2, 4, 4, RED);
    const out = removeBackground(img, 40);
    expect(out.data).toEqual(img.data);
    expect(hasOpaqueCorners(img)).toBe(false);
  });

  it('fades anti-aliased fringe pixels next to the fill', () => {
    const img = createImage(8, 8);
    fill(img, WHITE);
    rect(img, 2, 2, 4, 4, RED);
    rect(img, 2, 2, 1, 4, [235, 235, 235, 255]); // a light fringe column on the sprite's left edge
    const out = removeBackground(img, 24);
    const [, , , a] = px(out, 2, 3);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
  });
});

describe('detectGutters', () => {
  it('finds frame boxes separated by transparent rows and columns', () => {
    const img = sheet(20, 24, 3, 2, 10, 16);
    const g = detectGutters(img);
    expect(g.rows).toHaveLength(2);
    expect(g.columns).toHaveLength(3);
    expect(g.boxes).toHaveLength(6);
    expect(g.boxes[0]).toMatchObject({ x: 5, y: 8, w: 10, h: 16, cell: { column: 0, row: 0 } });
    expect(g.boxes[5]).toMatchObject({ x: 45, y: 32, w: 10, h: 16, cell: { column: 2, row: 1 } });
  });

  it('splits per row band so ragged rows still get their own boxes', () => {
    const img = createImage(40, 20);
    rect(img, 2, 2, 6, 6, RED);
    rect(img, 20, 2, 6, 6, RED);
    rect(img, 10, 12, 6, 6, BLUE); // second row has one frame, not under either of the first
    const g = detectGutters(img);
    expect(g.boxes.map((b) => [b.cell!.row, b.cell!.column])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it('returns nothing for an empty image', () => {
    expect(detectGutters(createImage(8, 8)).boxes).toEqual([]);
  });
});

describe('detectGrid', () => {
  it('detects the beze 4×8 layout of 48×64 frames', () => {
    const img = sheet(48, 64, 4, 8, 30, 56);
    const g = detectGrid(img);
    expect(g).toMatchObject({ frameWidth: 48, frameHeight: 64, columns: 4, rows: 8 });
    expect(g.confidence).toBeGreaterThan(0.98);
  });

  it('prefers the finest grid among the plausible ones rather than a 2×4 of double cells', () => {
    const g = detectGrid(sheet(32, 32, 4, 4, 20, 26));
    expect([g.columns, g.rows]).toEqual([4, 4]);
  });

  it('handles frame sizes that are not in the common list (AI image sizes)', () => {
    const g = detectGrid(sheet(256, 256, 4, 4, 180, 220));
    expect(g).toMatchObject({ frameWidth: 256, frameHeight: 256, columns: 4, rows: 4 });
  });

  it('gives zero confidence when there is a painted background', () => {
    const img = sheet(32, 32, 4, 4, 20, 26);
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) { img.data[i] = 255; img.data[i - 1] = 255; img.data[i - 2] = 255; img.data[i - 3] = 255; }
    expect(detectGrid(img).confidence).toBe(0);
    expect(hasOpaqueCorners(img)).toBe(true);
  });

  it('does not split tall cells holding short sprites into half-height rows', () => {
    // 4×8 sheet of 48×64 cells with 24 px tall slimes: the half-height lines are empty too.
    const g = detectGrid(sheet(48, 64, 4, 8, 30, 24));
    expect(g).toMatchObject({ frameWidth: 48, frameHeight: 64, columns: 4, rows: 8 });
    // A jumping slime crossing the half line now and then must not flip the answer either.
    const jumpy = sheet(48, 64, 4, 8, 30, 24);
    rect(jumpy, 9, 20, 30, 20, RED);
    expect(detectGrid(jumpy)).toMatchObject({ frameWidth: 48, frameHeight: 64, columns: 4, rows: 8 });
  });

  it('detects a single-row strip', () => {
    const g = detectGrid(sheet(24, 32, 6, 1, 14, 28));
    expect(g).toMatchObject({ frameWidth: 24, frameHeight: 32, columns: 6, rows: 1 });
  });
});

describe('grid versus gutters', () => {
  it('flags a coincidental grid that holds fewer columns than a row has frames', () => {
    // Four frames per row with uneven gaps on a 300 px wide sheet: a 3-column grid can fall into gaps.
    const img = createImage(300, 40);
    for (const x of [5, 60, 150, 230]) rect(img, x, 10, 20, 30, RED);
    const g = detectGutters(img);
    expect(maxBoxesPerRow(g)).toBe(4);
    expect(gridContradictsGutters({ frameWidth: 100, frameHeight: 40, columns: 3, rows: 1, confidence: 1 }, g)).toBe(true);
    expect(gridContradictsGutters({ frameWidth: 75, frameHeight: 40, columns: 4, rows: 1, confidence: 1 }, g)).toBe(false);
  });

  it('tells floating frames from grounded ones', () => {
    const grounded = trimCells(sheet(20, 24, 2, 1, 10, 12), 20, 24);
    const floating = trimCells(sheet(20, 24, 2, 1, 10, 12, 5), 20, 24);
    expect(framesFloat(grounded, 24)).toBe(false);
    expect(framesFloat(floating, 24)).toBe(true);
  });
});

describe('detectTileSize', () => {
  it('finds the tile size from repeating colour discontinuities', () => {
    const img = createImage(128, 64);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) rect(img, c * 32, r * 32, 32, 32, (r + c) % 2 ? [40, 160, 40, 255] : [160, 120, 60, 255]);
    const t = detectTileSize(img);
    expect(t.tileSize).toBe(32);
    expect(t.confidence).toBeGreaterThan(0.5);
  });

  it('falls back to the preferred size for a flat image', () => {
    const img = createImage(64, 64);
    fill(img, WHITE);
    expect(detectTileSize(img, [16, 32, 48, 64], 16).tileSize).toBe(16);
  });
});

describe('normalizeToGrid and repack', () => {
  it('bottom-centres every frame in its cell', () => {
    const boxes: Box[] = [
      { x: 0, y: 0, w: 10, h: 12 },
      { x: 20, y: 3, w: 6, h: 8 },
      { x: 2, y: 30, w: 10, h: 12 },
    ];
    const layout = normalizeToGrid(boxes, 16, 16);
    expect(layout).toMatchObject({ width: 32, height: 32, columns: 2, rows: 2 });
    expect(layout.placements[0]).toMatchObject({ column: 0, row: 0, x: 3, y: 4 });
    expect(layout.placements[1]).toMatchObject({ column: 1, row: 0, x: 21, y: 8 });
    expect(layout.placements[2]).toMatchObject({ column: 0, row: 1, x: 3, y: 20 });
  });

  it('uses cell tags when present and keeps forced dimensions', () => {
    const boxes: Box[] = [{ x: 0, y: 0, w: 4, h: 4, cell: { column: 2, row: 1 } }];
    const layout = normalizeToGrid(boxes, 8, 8, { columns: 4, rows: 4 });
    expect(layout).toMatchObject({ columns: 4, rows: 4, width: 32, height: 32 });
    expect(layout.placements[0]).toMatchObject({ x: 18, y: 12 });
  });

  it('repacks pixels so feet touch the bottom of the cell', () => {
    const src = sheet(20, 24, 2, 1, 10, 12, 5); // sprites float 5 px above the bottom
    const boxes = trimCells(src, 20, 24);
    expect(boxes).toHaveLength(2);
    const layout = normalizeToGrid(boxes, 20, 24, { columns: 2, rows: 1 });
    const out = repack(src, layout);
    expect(out.width).toBe(40);
    expect(px(out, 10, 23)).toEqual(BLUE); // bottom row of the cell now has the sprite
    expect(px(out, 10, 11)).toEqual(CLEAR); // above the 12 px sprite
    expect(px(out, 30, 23)).toEqual(BLUE);
  });

  it('clips frames larger than the cell instead of bleeding into neighbours', () => {
    const src = createImage(30, 10);
    rect(src, 0, 0, 30, 10, RED);
    const layout = normalizeToGrid([{ x: 0, y: 0, w: 30, h: 10 }, { x: 0, y: 0, w: 2, h: 2 }], 8, 8);
    const out = repack(src, layout);
    expect(layout.columns).toBe(2);
    expect(px(out, 7, 7)).toEqual(RED);
    expect(px(out, 8, 7)).toEqual(CLEAR); // second cell holds only the tiny frame, bottom-centred
    expect(px(out, 11, 7)).toEqual(RED);
  });

  it('suggests a cell size rounded to multiples of 8', () => {
    expect(suggestCellSize([{ x: 0, y: 0, w: 30, h: 50 }, { x: 0, y: 0, w: 33, h: 12 }])).toEqual({ cellWidth: 40, cellHeight: 56 });
  });

  it('crops to a whole number of cells', () => {
    const src = createImage(50, 30);
    rect(src, 0, 0, 50, 30, RED);
    const out = cropImage(src, 48, 24);
    expect(out.width).toBe(48);
    expect(px(out, 47, 23)).toEqual(RED);
    expect(cropImage(src, 50, 30)).toBe(src);
  });
});

describe('presets', () => {
  it('beze-v2 maps 4×8 rows to walk and attack animations like the starter sheets', () => {
    const a = presetAnimations('beze-v2', 4, 8);
    expect(a.walk_down.frames).toEqual([0, 1, 2, 3]);
    expect(a.idle_left.frames).toEqual([4]);
    expect(a.walk_up.frames).toEqual([12, 13, 14, 15]);
    expect(a.attack_down?.frames).toEqual([16, 17, 18]);
    expect(a.attack_up?.frames).toEqual([28, 29, 30]);
    expect(a.attack_up?.loop).toBe(false);
  });

  it('beze-v2 on a 4-row sheet has no attacks', () => {
    const a = presetAnimations('beze-v2', 4, 4);
    expect(a.attack_down).toBeUndefined();
    expect(a.walk_up.frames).toEqual([12, 13, 14, 15]);
  });

  it('rpgmaker uses the 0-1-2-1 walk and the middle frame for idle', () => {
    const a = presetAnimations('rpgmaker', 3, 4);
    expect(a.walk_down.frames).toEqual([0, 1, 2, 1]);
    expect(a.idle_down.frames).toEqual([1]);
    expect(a.walk_right.frames).toEqual([6, 7, 8, 7]);
  });

  it('four-rows uses every column', () => {
    const a = presetAnimations('four-rows', 6, 4);
    expect(a.walk_left.frames).toEqual([6, 7, 8, 9, 10, 11]);
    expect(a.idle_up.frames).toEqual([18]);
  });

  it('single uses frame 0 everywhere', () => {
    const a = presetAnimations('single', 1, 1);
    expect(a.walk_up.frames).toEqual([0]);
    expect(a.idle_right.frames).toEqual([0]);
  });

  it('never references frames beyond the sheet', () => {
    for (const preset of ['beze-v2', 'rpgmaker', 'four-rows', 'single'] as const) {
      for (const [c, r] of [[1, 1], [2, 2], [3, 4], [4, 8], [5, 3]]) {
        const a = presetAnimations(preset, c!, r!);
        for (const anim of Object.values(a)) for (const f of anim?.frames ?? []) expect(f).toBeLessThan(c! * r!);
      }
    }
  });

  it('guesses a preset from the grid', () => {
    expect(guessPreset(4, 8)).toBe('beze-v2');
    expect(guessPreset(3, 4)).toBe('rpgmaker');
    expect(guessPreset(6, 4)).toBe('four-rows');
    expect(guessPreset(1, 1)).toBe('single');
  });

  it('suggests a bottom-centred collider of half width and quarter height', () => {
    expect(suggestCollider(48, 64)).toEqual({ width: 24, height: 16, offsetX: 12, offsetY: 48 });
  });
});
