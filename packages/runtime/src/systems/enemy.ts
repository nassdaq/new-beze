import type { SpawnedEntity } from '../world/spawnEntity.js';
import { animate, updateWander } from './wander.js';

/** Chases the player inside the aggro radius; otherwise wanders or idles. Contact damage lives in combat.ts. */
export function updateEnemy(e: SpawnedEntity, player: SpawnedEntity | null, now: number): void {
  const en = e.enemy;
  const sprite = e.sprite;
  if (!en || !sprite || e.defeated) return;
  if (now < e.knockbackUntil) return;
  const target = player?.sprite;
  if (target && player && !player.defeated) {
    const dx = target.body!.center.x - sprite.body!.center.x;
    const dy = target.body!.center.y - sprite.body!.center.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= en.aggroRadius && dist > 4) {
      const vx = (dx / dist) * en.speed;
      const vy = (dy / dist) * en.speed;
      sprite.setVelocity(vx, vy);
      animate(e, vx, vy);
      return;
    }
  }
  if (e.wander) {
    updateWander(e, now);
    return;
  }
  sprite.setVelocity(0, 0);
  animate(e, 0, 0);
}
