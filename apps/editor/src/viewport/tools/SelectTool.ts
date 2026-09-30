import type { Entity } from '@beze/project-schema';
import { feetAlignedY } from '@beze/project-core';
import type { Tool, ToolContext, PointerInfo } from './Tool.js';
import { characterOf, entityRect, feet } from '../ViewportRenderer.js';

/** Click selects the top-most entity under the pointer; drag moves it with tile snapping. */
export class SelectTool implements Tool {
  cursor = 'default';
  private dragging: { entityId: string; offset: { x: number; y: number }; key: string } | null = null;

  onDown(ctx: ToolContext, p: PointerInfo): void {
    if (p.button !== 0) return;
    const hit = hitTest(ctx, p.world);
    if (!hit) {
      ctx.store.select({ kind: 'scene', sceneId: ctx.scene.id });
      return;
    }
    ctx.store.select({ kind: 'entity', sceneId: ctx.scene.id, entityId: hit.id });
    this.dragging = { entityId: hit.id, offset: { x: p.world.x - hit.x, y: p.world.y - hit.y }, key: `drag:${hit.id}:${Date.now()}` };
  }

  onMove(ctx: ToolContext, p: PointerInfo, down: boolean): void {
    if (!down || !this.dragging) return;
    const entity = ctx.scene.entities[this.dragging.entityId];
    if (!entity) return;
    const tileSize = ctx.project.settings.tileSize;
    const character = characterOf(ctx.project, entity);
    const rawX = p.world.x - this.dragging.offset.x;
    const rawY = p.world.y - this.dragging.offset.y;
    // Snap: x to the tile grid, y so the collider's feet sit on a tile bottom.
    const tx = Math.round(rawX / tileSize);
    const feetY = character ? rawY + character.collider.offsetY + character.collider.height : rawY + tileSize;
    const ty = Math.round(feetY / tileSize) - 1;
    const x = tx * tileSize;
    const y = character ? feetAlignedY(ty, tileSize, character) : ty * tileSize;
    if (x === entity.x && y === entity.y) return;
    ctx.store.dispatch('Move ' + entity.name, [{ op: 'placeEntity', sceneId: ctx.scene.id, entityId: entity.id, x, y }], { coalesceKey: this.dragging.key });
  }

  onUp(ctx: ToolContext): void {
    if (this.dragging) ctx.store.endCoalesce();
    this.dragging = null;
  }
}

export function hitTest(ctx: ToolContext, world: { x: number; y: number }): Entity | null {
  let best: Entity | null = null;
  let bestFeet = -Infinity;
  for (const id of ctx.scene.entityOrder) {
    const e = ctx.scene.entities[id];
    if (!e) continue;
    const r = entityRect(ctx.project, e);
    if (world.x >= r.x && world.x < r.x + r.w && world.y >= r.y && world.y < r.y + r.h) {
      const f = feet(e, characterOf(ctx.project, e));
      if (f >= bestFeet) { best = e; bestFeet = f; }
    }
  }
  return best;
}
