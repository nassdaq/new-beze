import Phaser from 'phaser';
import { spriteTop, type SpawnedEntity } from '../world/spawnEntity.js';

const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

/** Returns the interactable entity directly in front of the player, if any. */
export function findInteractable(player: SpawnedEntity, entities: SpawnedEntity[], tileSize: number): SpawnedEntity | null {
  const body = player.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
  if (!body) return null;
  // Probe half a tile beyond the leading edge of the player's collider.
  const [dx, dy] = DIR[player.facing];
  const reach = tileSize / 2;
  const px = dx === 0 ? body.center.x : dx < 0 ? body.left - reach : body.right + reach;
  const py = dy === 0 ? body.center.y : dy < 0 ? body.top - reach : body.bottom + reach;
  for (const e of entities) {
    if (!e.interact || e === player) continue;
    const rect = interactRect(e);
    if (rect && Phaser.Geom.Rectangle.Contains(rect, px, py)) return e;
  }
  return null;
}

function interactRect(e: SpawnedEntity): Phaser.Geom.Rectangle | null {
  const pad = 6;
  if (e.sprite && e.character) {
    const c = e.character.collider;
    return new Phaser.Geom.Rectangle(e.sprite.x + c.offsetX - pad, spriteTop(e) + c.offsetY - pad, c.width + pad * 2, c.height + pad * 2);
  }
  return new Phaser.Geom.Rectangle(e.entity.x - pad, e.entity.y - pad, 32 + pad * 2, 32 + pad * 2);
}
