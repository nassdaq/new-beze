import { isRoad, isSidewalk, tagAt, type TagIndex } from '../world/tags.js';

/**
 * Pure: finds where traffic and pedestrians can go on a map.
 *
 * A road *band* is a run of consecutive rows (or columns) of road tiles; a lane is one row/column of a band with a
 * direction: the band's last row drives right (+1), its first row drives left (-1), like right-hand traffic seen
 * from above; for vertical bands the last column drives down and the first drives up. A one-row band gets a single
 * right/down lane. Lanes are cut where the run of road tiles ends, so a road that stops at a barrier is one lane.
 *
 * Sidewalk *walks* are straight runs of walkable pavement at least `minLen` long, for pedestrians to pace along.
 */

export interface Lane {
  axis: 'h' | 'v';
  /** Row (h) or column (v) the lane runs on. */
  line: number;
  /** First and last tile along the lane, inclusive. */
  from: number;
  to: number;
  /** +1 right/down, -1 left/up. */
  dir: 1 | -1;
}

export interface Walk {
  axis: 'h' | 'v';
  line: number;
  from: number;
  to: number;
}

/** Runs of cells along one row (axis h) or column (axis v) where `pred` holds, at least `minLen` long. */
function runs(index: TagIndex, axis: 'h' | 'v', line: number, pred: (tag: string) => boolean, minLen: number): Array<[number, number]> {
  const len = axis === 'h' ? index.width : index.height;
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= len; i++) {
    const tag = i < len ? (axis === 'h' ? tagAt(index, i, line) : tagAt(index, line, i)) : '';
    if (i < len && pred(tag)) { if (start < 0) start = i; continue; }
    if (start >= 0 && i - start >= minLen) out.push([start, i - 1]);
    start = -1;
  }
  return out;
}

export function findLanes(index: TagIndex, minLen = 8): Lane[] {
  const lanes: Lane[] = [];
  for (const axis of ['h', 'v'] as const) {
    const lines = axis === 'h' ? index.height : index.width;
    // Group consecutive lines that carry a long enough road run into bands.
    const hasRoad = (line: number) => runs(index, axis, line, isRoad, minLen).length > 0;
    let bandStart = -1;
    for (let line = 0; line <= lines; line++) {
      const road = line < lines && hasRoad(line);
      if (road) { if (bandStart < 0) bandStart = line; continue; }
      if (bandStart >= 0) {
        const bandEnd = line - 1;
        const push = (l: number, dir: 1 | -1) => { for (const [from, to] of runs(index, axis, l, isRoad, minLen)) lanes.push({ axis, line: l, from, to, dir }); };
        if (bandEnd === bandStart) push(bandStart, 1);
        else { push(bandEnd, 1); push(bandStart, -1); }
        bandStart = -1;
      }
    }
  }
  return lanes;
}

export function findWalks(index: TagIndex, minLen = 6): Walk[] {
  const walks: Walk[] = [];
  for (let y = 0; y < index.height; y++) for (const [from, to] of runs(index, 'h', y, isSidewalk, minLen)) walks.push({ axis: 'h', line: y, from, to });
  for (let x = 0; x < index.width; x++) for (const [from, to] of runs(index, 'v', x, isSidewalk, minLen)) walks.push({ axis: 'v', line: x, from, to });
  return walks;
}

/** Cells carrying one of `tags` (exact or prefix with a trailing underscore). */
export function findCells(index: TagIndex, tags: readonly string[]): Array<{ x: number; y: number; tag: string }> {
  const out: Array<{ x: number; y: number; tag: string }> = [];
  for (let i = 0; i < index.tags.length; i++) {
    const tag = index.tags[i]!;
    if (!tag) continue;
    if (tags.some((t) => (t.endsWith('_') ? tag.startsWith(t) : tag === t))) out.push({ x: i % index.width, y: Math.floor(i / index.width), tag });
  }
  return out;
}
