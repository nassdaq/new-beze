import type { Direction } from '@beze/project-schema';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { KEYS } from '../context.js';
import type { MoveInput } from './input.js';

export { createMoveKeys, type MoveKeys } from './input.js';

/** `settings.runSpeedMultiplier` when the document leaves it out. */
export const DEFAULT_RUN_MULTIPLIER = 1.7;
/** The walk animation plays this much faster while running. */
export const RUN_ANIM_SCALE = 1.5;

/**
 * Four-direction movement. Horizontal wins over vertical; no diagonals in v1. While knocked back the body keeps its
 * knockback velocity; while swinging or emoting (`attackUntil`) the player stands still and whoever started the
 * animation owns it. Holding run multiplies the speed by `runMultiplier` and speeds up the walk animation; running
 * never applies while locked (dialogue, game over), attacking or knocked back. Returns true while the player is running.
 */
export function updatePlayer(player: SpawnedEntity, input: MoveInput, locked: boolean, now = 0, runMultiplier = DEFAULT_RUN_MULTIPLIER): boolean {
  const sprite = player.sprite;
  const character = player.character;
  if (!sprite || !character || player.defeated) return false;
  sprite.setDepth(sprite.y);
  if (now < player.knockbackUntil) return false;
  if (now < player.attackUntil) {
    sprite.setVelocity(0, 0);
    return false;
  }
  let vx = 0;
  let vy = 0;
  let facing: Direction | null = null;
  const running = !locked && input.run;
  const speed = running ? player.speed * runMultiplier : player.speed;
  if (!locked) {
    if (input.left) { vx = -speed; facing = 'left'; }
    else if (input.right) { vx = speed; facing = 'right'; }
    else if (input.up) { vy = -speed; facing = 'up'; }
    else if (input.down) { vy = speed; facing = 'down'; }
  }
  sprite.setVelocity(vx, vy);
  if (facing) player.facing = facing;
  const moving = vx !== 0 || vy !== 0;
  const anim = KEYS.animation(character.id, `${moving ? 'walk' : 'idle'}_${player.facing}`);
  if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim, true);
  sprite.anims.timeScale = moving && running ? RUN_ANIM_SCALE : 1;
  return moving && running;
}

export function setFacing(player: SpawnedEntity, facing: Direction): void {
  player.facing = facing;
  if (player.sprite && player.character) player.sprite.play(KEYS.animation(player.character.id, `idle_${facing}`), true);
}
