import type { Direction } from '@beze/project-schema';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { KEYS } from '../context.js';

const DIRS: Array<[number, number]> = [[0, 0], [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

/** Random cardinal strolls around the spawn point. Returns to the origin when it drifts too far. */
export function updateWander(e: SpawnedEntity, now: number): void {
  const w = e.wander;
  const sprite = e.sprite;
  if (!w || !sprite || e.defeated || now < e.knockbackUntil) return;
  if (now >= w.until) {
    const dx = sprite.x - w.originX;
    const dy = sprite.y - w.originY;
    if (Math.hypot(dx, dy) > w.radius) {
      w.dirX = Math.abs(dx) > Math.abs(dy) ? -Math.sign(dx) : 0;
      w.dirY = w.dirX === 0 ? -Math.sign(dy) : 0;
    } else {
      const pick = DIRS[Math.floor(Math.random() * DIRS.length)]!;
      w.dirX = pick[0];
      w.dirY = pick[1];
    }
    w.until = now + 700 + Math.random() * 900;
  }
  sprite.setVelocity(w.dirX * w.speed, w.dirY * w.speed);
  animate(e, w.dirX, w.dirY);
}

export function facingFromVelocity(dx: number, dy: number, fallback: Direction): Direction {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

export function animate(e: SpawnedEntity, dx: number, dy: number): void {
  if (!e.sprite || !e.character) return;
  const moving = dx !== 0 || dy !== 0;
  e.facing = facingFromVelocity(dx, dy, e.facing);
  const key = KEYS.animation(e.character.id, `${moving ? 'walk' : 'idle'}_${e.facing}`);
  if (e.sprite.anims.currentAnim?.key !== key) e.sprite.play(key, true);
  e.sprite.setDepth(e.sprite.y + e.character.frameHeight);
}
