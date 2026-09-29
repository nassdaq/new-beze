import type { Tool, ToolContext, PointerInfo } from './Tool.js';

/** Paints the active gid onto the active layer. The whole stroke is one undo step. */
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
    const layerId = ctx.store.tileBrush.layerId ?? ctx.map.layers[0]?.id;
    if (!layerId) return;
    const cellKey = `${p.tile.x},${p.tile.y}`;
    if (cellKey === this.last) return;
    this.last = cellKey;
    const gid = this.erase ? 0 : ctx.store.tileBrush.gid;
    ctx.store.dispatch(this.erase ? 'Erase tiles' : 'Paint tiles', [{ op: 'paintTiles', mapId: ctx.map.id, layerId, cells: [{ x: p.tile.x, y: p.tile.y, gid }] }], { coalesceKey: this.key });
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
