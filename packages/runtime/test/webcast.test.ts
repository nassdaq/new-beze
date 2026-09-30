import { describe, expect, it } from 'vitest';
import { castWeb, type WebGrid } from '../src/systems/webcast.js';

/**
 * A 12x6 grid, 32 px tiles. Row 2 is the "street": walkable from x=0..7, then a building whose wall (2) spans
 * x=8..9 with a solid core (1) at x=10..11. Row 4 is a roof: ledge (2) at x=3 and x=8, tar (0) between.
 */
function grid(): WebGrid {
  const width = 12; const height = 6;
  const collision = new Array<number>(width * height).fill(0);
  const set = (x: number, y: number, v: number) => { collision[y * width + x] = v; };
  for (const x of [8, 9]) set(x, 2, 2);
  for (const x of [10, 11]) set(x, 2, 1);
  set(3, 4, 2); set(8, 4, 2);
  set(6, 0, 1);
  return { width, height, tileSize: 32, collision };
}
const centre = (tx: number, ty: number) => ({ x: tx * 32 + 16, y: ty * 32 + 16 });

describe('castWeb', () => {
  it('hits the first enemy along the line before anything else', () => {
    const hit = castWeb(grid(), centre(1, 2), 'right', 32 * 7, [{ item: 'thug', x: 4 * 32 + 4, y: 2 * 32 + 8, width: 24, height: 16 }], false);
    expect(hit).toMatchObject({ kind: 'enemy', target: 'thug' });
  });

  it('sticks to a wall and lands the zip on the last free cell before it for a non-climber', () => {
    const hit = castWeb(grid(), centre(1, 2), 'right', 32 * 10, [], false);
    expect(hit.kind).toBe('wall');
    if (hit.kind === 'wall') {
      expect(hit.climbable).toBe(true);
      expect(hit.land).toEqual(centre(7, 2));
    }
  });

  it('lets a climber grab the wall itself across a gap and land on it', () => {
    const hit = castWeb(grid(), centre(1, 2), 'right', 32 * 10, [], true);
    expect(hit).toMatchObject({ kind: 'wall', climbable: true, land: centre(8, 2) });
  });

  it('runs along a climbable stretch that starts next to the player, and grabs one across a gap', () => {
    // Standing on the roof at x=4 facing left: the ledge at x=3 is adjacent, a one-cell run: the zip ends on it.
    expect(castWeb(grid(), centre(4, 4), 'left', 32 * 10, [], true)).toMatchObject({ kind: 'wall', land: centre(3, 4), climbable: true });
    // Facing right from x=4: tar until the far ledge at x=8, with free cells in between: grab it.
    expect(castWeb(grid(), centre(4, 4), 'right', 32 * 10, [], true)).toMatchObject({ kind: 'wall', land: centre(8, 4) });
    // On the street right in front of the two-cell wall at x=8..9: the run carries up to x=9 (the solid core stops it).
    expect(castWeb(grid(), centre(7, 2), 'right', 32 * 10, [], true)).toMatchObject({ kind: 'wall', land: centre(9, 2) });
    // A run cut short by the range still lands on the last cell reached.
    expect(castWeb(grid(), centre(7, 2), 'right', 32 * 1, [], true)).toMatchObject({ kind: 'wall', land: centre(8, 2) });
    // Non-climbers never run: the adjacent wall is just a wall with nowhere to land.
    expect(castWeb(grid(), centre(7, 2), 'right', 32 * 10, [], false)).toMatchObject({ kind: 'wall', land: null });
  });

  it('a climber flying over climbable cells still stops at a solid wall, landing on the last cell before it', () => {
    const hit = castWeb(grid(), centre(1, 2), 'right', 32 * 11, [], true);
    // First grab wins (x=8); from x=8 itself the next real obstacle is the solid core.
    expect(hit).toMatchObject({ kind: 'wall', land: centre(8, 2) });
    const onWall = castWeb(grid(), centre(8, 2), 'right', 32 * 11, [], true);
    expect(onWall).toMatchObject({ kind: 'wall', climbable: false, land: centre(9, 2) });
  });

  it('reports "none" at the end of the range or the map edge, with the far point', () => {
    const short = castWeb(grid(), centre(1, 2), 'right', 32 * 3, [], false);
    expect(short.kind).toBe('none');
    if (short.kind === 'none') expect(short.x).toBeCloseTo(32 + 16 + 96);
    expect(castWeb(grid(), centre(1, 5), 'down', 32 * 5, [], false).kind).toBe('none');
  });

  it('a wall in the very first cell gives no landing spot', () => {
    const hit = castWeb(grid(), centre(6, 1), 'up', 32 * 3, [], false);
    expect(hit).toMatchObject({ kind: 'wall', land: null });
  });

  it('works without a grid: enemies only', () => {
    expect(castWeb(null, { x: 0, y: 0 }, 'down', 100, [{ item: 1, x: -10, y: 40, width: 20, height: 20 }], false)).toMatchObject({ kind: 'enemy', target: 1 });
    expect(castWeb(null, { x: 0, y: 0 }, 'down', 100, [], false)).toMatchObject({ kind: 'none', y: 100 });
  });
});
