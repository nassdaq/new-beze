import type { Operation, Project, TileMap } from '@beze/project-schema';
import type { Tool, ToolContext, PointerInfo } from './Tool.js';
import type { Point } from '../camera.js';

interface Cell { x: number; y: number; gid: number }

/** The tileset reference that owns `gid` on this map, with its local tile index. */
function localTile(project: Project, map: TileMap, gid: number): { tilesetId: string; local: number } | null {
  let best: { tilesetId: string; firstGid: number } | null = null;
  for (const ref of map.tilesets) if (ref.firstGid <= gid && (!best || ref.firstGid > best.firstGid)) best = ref;
  if (!best || !project.tilesets[best.tilesetId]) return null;
  return { tilesetId: best.tilesetId, local: gid - best.firstGid };
}

function isSolid(project: Project, tilesetId: string, local: number): boolean {
  return !!project.tilesets[tilesetId]?.tileProperties[String(local)]?.solid;
}

/** Operations for one single-tile paint: the tile plus, with auto collision, a solid mark when the tile is solid. */
export function tileOperations(project: Project, map: TileMap, layerId: string, cell: Cell, autoCollision: boolean): Operation[] {
  const ops: Operation[] = [{ op: 'paintTiles', mapId: map.id, layerId, cells: [cell] }];
  const t = cell.gid > 0 ? localTile(project, map, cell.gid) : null;
  if (autoCollision && t && isSolid(project, t.tilesetId, t.local)) ops.push({ op: 'setCollision', mapId: map.id, cells: [{ x: cell.x, y: cell.y, solid: true }] });
  return ops;
}

/**
 * The layer a stamp's ground-level cells (trunks, walls) go on. Objects sit on top of the map's
 * fill layer, so when the active layer is the first one the cells move to the lowest layer above it
 * that is not drawn over entities; painting them on the fill layer would punch a hole in the grass.
 */
export function objectLayerId(map: TileMap, activeLayerId: string): string {
  if (map.layers[0]?.id !== activeLayerId) return activeLayerId;
  return map.layers.slice(1).find((l) => !l.aboveEntities)?.id ?? activeLayerId;
}

/**
 * Operations for painting a stamp with its top-left cell at `anchor`: cells flagged `above` go on
 * the topmost layer drawn over entities (the active layer when the map has none), the others on the
 * active layer, or on the first object layer above it when the active layer is the map's fill layer
 * (see `objectLayerId`); solid cells also get collision when `autoCollision` is on. Cells outside the
 * map are dropped.
 */
export function stampOperations(project: Project, map: TileMap, ref: { tilesetId: string; index: number }, anchor: Point, activeLayerId: string, autoCollision: boolean): Operation[] {
  const tileset = project.tilesets[ref.tilesetId];
  const stamp = tileset?.stamps?.[ref.index];
  const tsRef = map.tilesets.find((t) => t.tilesetId === ref.tilesetId);
  if (!tileset || !stamp || !tsRef) return [];
  const groundLayerId = objectLayerId(map, activeLayerId);
  const aboveLayerId = [...map.layers].reverse().find((l) => l.aboveEntities)?.id ?? groundLayerId;
  const byLayer = new Map<string, Cell[]>();
  const solid: { x: number; y: number; solid: boolean }[] = [];
  stamp.tiles.forEach((local, i) => {
    if (local < 0) return;
    const x = anchor.x + (i % stamp.width);
    const y = anchor.y + Math.floor(i / stamp.width);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    const layerId = stamp.above?.[i] ? aboveLayerId : groundLayerId;
    const cells = byLayer.get(layerId) ?? [];
    cells.push({ x, y, gid: tsRef.firstGid + local });
    byLayer.set(layerId, cells);
    if (autoCollision && isSolid(project, ref.tilesetId, local)) solid.push({ x, y, solid: true });
  });
  const ops: Operation[] = [];
  for (const [layerId, cells] of byLayer) ops.push({ op: 'paintTiles', mapId: map.id, layerId, cells });
  if (solid.length) ops.push({ op: 'setCollision', mapId: map.id, cells: solid });
  return ops;
}

/**
 * Paints the active gid, or the active stamp, onto the active layer. The whole stroke is one undo
 * step; a stamp paints all its cells in one batch (see `stampOperations`).
 */
export class TileBrushTool implements Tool {
  cursor = 'crosshair';
  private key: string | null = null;
  private last: string | null = null;

  constructor(private erase = false) {}

  onDown(ctx: ToolContext, p: PointerInfo): void {
    if (p.button !== 0) return;
    this.key = `paint:${Date.now()}`;
    this.last = null;
    this.paint(ctx, p);
  }

  onMove(ctx: ToolContext, p: PointerInfo, down: boolean): void {
    if (down && this.key) this.paint(ctx, p);
  }

  onUp(ctx: ToolContext): void {
    if (this.key) ctx.store.endCoalesce();
    this.key = null;
  }

  private paint(ctx: ToolContext, p: PointerInfo): void {
    if (!ctx.map || !p.inMap || !this.key) return;
    const brush = ctx.store.tileBrush;
    const layerId = brush.layerId ?? ctx.map.layers[0]?.id;
    if (!layerId) return;
    const cellKey = `${p.tile.x},${p.tile.y}`;
    if (cellKey === this.last) return;
    this.last = cellKey;
    let ops: Operation[];
    if (this.erase) ops = [{ op: 'paintTiles', mapId: ctx.map.id, layerId, cells: [{ x: p.tile.x, y: p.tile.y, gid: 0 }] }];
    else if (brush.stamp) ops = stampOperations(ctx.project, ctx.map, brush.stamp, p.tile, layerId, brush.autoCollision);
    else ops = tileOperations(ctx.project, ctx.map, layerId, { x: p.tile.x, y: p.tile.y, gid: brush.gid }, brush.autoCollision);
    if (ops.length === 0) return;
    ctx.store.dispatch(this.erase ? 'Erase tiles' : brush.stamp ? 'Place object' : 'Paint tiles', ops, { coalesceKey: this.key });
  }
}

/** Marks tiles solid or walkable. Shift inverts the current mode. */
export class CollisionTool implements Tool {
  cursor = 'crosshair';
  private key: string | null = null;
  private last: string | null = null;

  onDown(ctx: ToolContext, p: PointerInfo): void {
    if (p.button !== 0) return;
    this.key = `collision:${Date.now()}`;
    this.last = null;
    this.paint(ctx, p);
  }

  onMove(ctx: ToolContext, p: PointerInfo, down: boolean): void {
    if (down && this.key) this.paint(ctx, p);
  }

  onUp(ctx: ToolContext): void {
    if (this.key) ctx.store.endCoalesce();
    this.key = null;
  }

  private paint(ctx: ToolContext, p: PointerInfo): void {
    if (!ctx.map || !p.inMap || !this.key) return;
    const cellKey = `${p.tile.x},${p.tile.y}`;
    if (cellKey === this.last) return;
    this.last = cellKey;
    const solid = (ctx.store.collisionMode === 'solid') !== p.shiftKey;
    ctx.store.dispatch('Edit collision', [{ op: 'setCollision', mapId: ctx.map.id, cells: [{ x: p.tile.x, y: p.tile.y, solid }] }], { coalesceKey: this.key });
  }
}
