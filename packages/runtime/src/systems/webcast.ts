import type { Direction } from '@beze/project-schema';

/**
 * Pure geometry for the web ability (no Phaser): walks a straight line from the player across the map's collision
 * grid and reports the first thing it reaches. Cell values: 0 walkable, 1 solid, 2 climbable (solid for anyone who
 * cannot climb).
 *
 * For a climber, cells marked 2 are not obstacles in themselves: the web flies over roofs and only stops at a wall
 * (1), the map edge or the end of its range. Entering a climbable cell from walkable ground, with at least one
 * walkable cell between it and the player's own cell, is the "wall grab": the web sticks to the building and the zip
 * lands on that cell (its edge), which is how you get from the street onto a roof, or across the street onto the
 * next one. A climbable run that starts right next to the player (the facade in front of them on the street, or
 * the ledge of the roof they stand on) is a "wall run" instead: the zip carries them along it to its far end, up the
 * facade onto the ledge, or from the roof edge down to the street.
 */

export interface WebGrid {
  width: number;
  height: number;
  tileSize: number;
  /** width*height, row-major. */
  collision: ArrayLike<number>;
}

export interface WebTarget<T> {
  item: T;
  /** Axis-aligned body rectangle in world px. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WebHit<T> =
  /** An enemy body along the line; (x, y) is the contact point. */
  | { kind: 'enemy'; target: T; x: number; y: number }
  /** Stuck to a wall (or grabbed a climbable edge); `land` is where the player's body centre zips to, or null when the
   *  line hit a wall from the very first cell (nowhere to go). */
  | { kind: 'wall'; x: number; y: number; land: { x: number; y: number } | null; climbable: boolean }
  /** Reached its full range or the map edge without touching anything; (x, y) is the far end. */
  | { kind: 'none'; x: number; y: number };

const DIR: Record<Direction, readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Samples per tile along the line: fine enough that a 16 px body cannot be stepped over. */
const SAMPLES_PER_TILE = 4;

function cellAt(grid: WebGrid, x: number, y: number): number | null {
  const tx = Math.floor(x / grid.tileSize);
  const ty = Math.floor(y / grid.tileSize);
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return null;
  return grid.collision[ty * grid.width + tx] ?? 0;
}

function tileCentre(grid: WebGrid, x: number, y: number): { x: number; y: number } {
  const T = grid.tileSize;
  return { x: Math.floor(x / T) * T + T / 2, y: Math.floor(y / T) * T + T / 2 };
}

/**
 * Casts the web from `origin` (the player's body centre) in `facing` for at most `rangePx`.
 * `landing` snaps the zip destination to the centre of the last free tile along the travel axis while keeping the
 * player's other coordinate, so a zip never drifts sideways.
 */
export function castWeb<T>(grid: WebGrid | null, origin: { x: number; y: number }, facing: Direction, rangePx: number, targets: ReadonlyArray<WebTarget<T>>, canClimb: boolean): WebHit<T> {
  const [dx, dy] = DIR[facing];
  const step = grid ? grid.tileSize / SAMPLES_PER_TILE : 8;
  const steps = Math.max(1, Math.ceil(rangePx / step));
  const landing = (px: number, py: number): { x: number; y: number } => {
    if (!grid) return { x: px, y: py };
    const c = tileCentre(grid, px, py);
    return dx !== 0 ? { x: c.x, y: origin.y } : { x: origin.x, y: c.y };
  };
  const startCell = grid ? cellAt(grid, origin.x, origin.y) : 0;
  const startTile = grid ? `${Math.floor(origin.x / grid.tileSize)},${Math.floor(origin.y / grid.tileSize)}` : '';
  let prevX = origin.x;
  let prevY = origin.y;
  let prevCell = startCell;
  let prevFree = startCell !== 1;
  /** The tile of the last free sample; a landing on the player's own tile is no landing at all. */
  let prevTile = startTile;
  /** Inside a climbable run that began next to the player: the zip ends where the run ends. */
  let wallRun = canClimb && startCell === 2;
  // Distinct walkable cells crossed since the last non-walkable one, not counting the cell the player stands in: a
  // climbable cell right next to the player (the ledge of the roof they are on) is walked onto, not zipped to.
  const gapCells = new Set<string>();
  for (let i = 1; i <= steps; i++) {
    const d = Math.min(step * i, rangePx);
    const x = origin.x + dx * d;
    const y = origin.y + dy * d;
    for (const t of targets) {
      if (x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height) return { kind: 'enemy', target: t.item, x, y };
    }
    if (grid) {
      const cell = cellAt(grid, x, y);
      if (cell === null) return { kind: 'none', x: prevX, y: prevY };
      const blocked = cell === 1 || (cell === 2 && !canClimb);
      if (blocked) {
        // The wall face is where the line crossed into the cell; the player lands on the last free cell before it.
        return { kind: 'wall', x, y, land: prevFree && prevTile !== startTile ? landing(prevX, prevY) : null, climbable: cell === 2 };
      }
      if (cell === 2 && prevCell !== 2 && canClimb) {
        // Grabbed the edge of something climbable across a gap: zip onto it. Adjacent: run along it instead.
        if (gapCells.size > 0) return { kind: 'wall', x, y, land: landing(x, y), climbable: true };
        wallRun = true;
      }
      if (wallRun && cell !== 2) {
        // The run ended: land on its last cell (unless that is where the player already stands).
        return { kind: 'wall', x: prevX, y: prevY, land: prevTile !== startTile ? landing(prevX, prevY) : null, climbable: true };
      }
      const key = `${Math.floor(x / grid.tileSize)},${Math.floor(y / grid.tileSize)}`;
      if (cell === 0) {
        if (key !== startTile) gapCells.add(key);
      } else {
        gapCells.clear();
      }
      prevCell = cell;
      prevFree = true;
      prevTile = key;
    }
    prevX = x;
    prevY = y;
  }
  if (wallRun && prevTile !== startTile) return { kind: 'wall', x: prevX, y: prevY, land: landing(prevX, prevY), climbable: true };
  return { kind: 'none', x: prevX, y: prevY };
}
