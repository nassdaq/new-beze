import { placeCharacter } from '@beze/project-core';
import type { Tool, ToolContext, PointerInfo } from './Tool.js';
import { toast } from '../../ui/Toast.js';

/** Click drops the chosen character on a tile as a new entity. */
export class PlaceEntityTool implements Tool {
  cursor = 'copy';

  onDown(ctx: ToolContext, p: PointerInfo): void {
    if (p.button !== 0 || !p.inMap) return;
    const characterId = ctx.store.placeCharacterId;
    const character = characterId ? ctx.project.characters[characterId] : undefined;
    if (!characterId || !character) {
      toast.error('Pick a character to place first');
      return;
    }
    const count = Object.keys(ctx.scene.entities).length + 1;
    const { ops, entityId } = placeCharacter(ctx.project, { sceneId: ctx.scene.id, characterId, name: `${character.name} ${count}`, tileX: p.tile.x, tileY: p.tile.y });
    const r = ctx.store.dispatch('Place ' + character.name, ops);
    if (!r.ok) {
      toast.error('Could not place entity', r.errors.map((e) => e.message));
      return;
    }
    ctx.store.select({ kind: 'entity', sceneId: ctx.scene.id, entityId });
    ctx.store.setTool('select');
  }
}
