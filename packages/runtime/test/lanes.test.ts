import { describe, expect, it } from 'vitest';
import { findCells, findLanes, findWalks } from '../src/systems/lanes.js';
import type { TagIndex } from '../src/world/tags.js';

/** A 16x10 map: a 3-row road across rows 4-6, a 1-column road down column 10 (rows 0-3 and 7-9, cut by the crossing), sidewalks on rows 3 and 7. */
function index(): TagIndex {
  const width = 16; const height = 10;
  const tags = new Array<string>(width * height).fill('grass');
  const set = (x: number, y: number, t: string) => { tags[y * width + x] = t; };
  for (let x = 0; x < width; x++) { set(x, 4, 'road'); set(x, 5, 'road_line_h'); set(x, 6, 'road'); set(x, 3, 'sidewalk_edge_s'); set(x, 7, 'sidewalk'); }
  for (let y = 0; y < height; y++) if (y < 4 || y > 6) set(10, y, 'road_line_v');
  set(10, 4, 'road'); set(10, 5, 'road_cross'); set(10, 6, 'road');
  set(2, 1, 'roof_vent'); set(5, 9, 'alley_manhole'); set(7, 1, 'sign_pizza');
  return { width, height, tags };
}

describe('lanes', () => {
  it('turns a three-row road into a right lane on its bottom row and a left lane on its top row', () => {
    const lanes = findLanes(index());
    const h = lanes.filter((l) => l.axis === 'h');
    expect(h).toEqual(expect.arrayContaining([
      { axis: 'h', line: 6, from: 0, to: 15, dir: 1 },
      { axis: 'h', line: 4, from: 0, to: 15, dir: -1 },
    ]));
    expect(h.some((l) => l.line === 5)).toBe(false);
  });

  it('a one-column road drives down and spans the crossing (the crossing tiles are road too)', () => {
    const v = findLanes(index()).filter((l) => l.axis === 'v');
    expect(v).toEqual([{ axis: 'v', line: 10, from: 0, to: 9, dir: 1 }]);
  });

  it('ignores road stubs shorter than the minimum', () => {
    const i = index();
    for (let x = 0; x < 3; x++) i.tags[9 * i.width + x] = 'road';
    expect(findLanes(i, 8).some((l) => l.line === 9)).toBe(false);
  });

  it('finds sidewalk walks and tagged cells', () => {
    const walks = findWalks(index());
    expect(walks).toEqual(expect.arrayContaining([{ axis: 'h', line: 3, from: 0, to: 9 }, { axis: 'h', line: 7, from: 0, to: 9 }]));
    expect(findCells(index(), ['roof_vent', 'alley_manhole', 'sign_'])).toEqual([
      { x: 2, y: 1, tag: 'roof_vent' }, { x: 7, y: 1, tag: 'sign_pizza' }, { x: 5, y: 9, tag: 'alley_manhole' },
    ]);
  });
});
