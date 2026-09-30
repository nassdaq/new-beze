import type { Direction } from '@beze/project-schema';
import { KEYS } from '../context.js';
import type { SpawnedEntity } from '../world/spawnEntity.js';

export interface AttackAnimation {
  key: string;
  /** Milliseconds one frame stays on screen, from the character's own frameRate. */
  frameMs: number;
  /** Whole animation, once through. */
  durationMs: number;
  /** When the strike frame (the second frame, or the first for a one-frame animation) starts. */
  strikeMs: number;
}

/** The optional `attack_<facing>` animation of an entity's character, timed from its data, or null when it has none. */
export function attackAnimation(e: SpawnedEntity, facing: Direction): AttackAnimation | null {
  const c = e.character;
  const def = c?.animations[`attack_${facing}`];
  if (!c || !def || def.frames.length === 0) return null;
  const frameMs = 1000 / def.frameRate;
  return { key: KEYS.animation(c.id, `attack_${facing}`), frameMs, durationMs: frameMs * def.frames.length, strikeMs: def.frames.length > 1 ? frameMs : 0 };
}

/** Plays the entity's idle animation for its facing. Used to settle a sprite after a one-shot animation. */
export function playIdle(e: SpawnedEntity): void {
  if (!e.sprite || !e.character) return;
  e.sprite.play(KEYS.animation(e.character.id, `idle_${e.facing}`), true);
}
