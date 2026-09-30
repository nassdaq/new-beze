import type { SpawnedEntity } from '../world/spawnEntity.js';

const PERIOD_MS = 2600;
const AMPLITUDE = 0.015;

/** True when nothing else is animating or moving the entity: standing still, not swinging, hurt or telegraphing. */
export function isIdle(e: SpawnedEntity, now: number): boolean {
  const body = e.sprite?.body as { velocity: { x: number; y: number } } | null | undefined;
  if (!e.sprite || e.defeated || now < e.knockbackUntil || now < e.attackUntil) return false;
  if (e.enemy && e.enemy.phase !== 'chase') return false;
  return !body || (body.velocity.x === 0 && body.velocity.y === 0);
}

/**
 * Subtle breathing: the sprite's y scale rides a slow sine while the entity is idle, so a still scene does not look
 * frozen. Only touches `scaleY` while idle, and hands it back at exactly 1 the moment something else takes over.
 */
export function updateBreathing(e: SpawnedEntity, now: number): void {
  const sprite = e.sprite;
  if (!sprite) return;
  if (isIdle(e, now)) {
    sprite.scaleY = 1 + AMPLITUDE * (0.5 + 0.5 * Math.sin((now / PERIOD_MS) * Math.PI * 2 + e.breathPhase));
    e.breathing = true;
  } else if (e.breathing) {
    sprite.scaleY = 1;
    e.breathing = false;
  }
}
