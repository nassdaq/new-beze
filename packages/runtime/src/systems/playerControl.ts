import Phaser from 'phaser';
import type { Direction } from '@beze/project-schema';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { KEYS } from '../context.js';

export interface MoveKeys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  /** Hold to run. Phaser maps both Shift keys to the one SHIFT key code. */
  run: Phaser.Input.Keyboard.Key[];
}

/** `settings.runSpeedMultiplier` when the document leaves it out. */
export const DEFAULT_RUN_MULTIPLIER = 1.7;
/** The walk animation plays this much faster while running. */
export const RUN_ANIM_SCALE = 1.5;

export function createMoveKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): MoveKeys {
  const K = Phaser.Input.Keyboard.KeyCodes;
  const add = (...codes: number[]) => codes.map((c) => keyboard.addKey(c));
  return { up: add(K.UP, K.W), down: add(K.DOWN, K.S), left: add(K.LEFT, K.A), right: add(K.RIGHT, K.D), run: add(K.SHIFT) };
}

const down = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);

/**
 * Four-direction movement. Horizontal wins over vertical; no diagonals in v1. While knocked back the body keeps its
 * knockback velocity; while swinging (`attackUntil`) the player stands still and combat.ts owns the animation.
 * Holding the run key multiplies the speed by `runMultiplier` and speeds up the walk animation; running never applies
 * while locked (dialogue, game over), attacking or knocked back. Returns true while the player is running.
 */
export function updatePlayer(player: SpawnedEntity, keys: MoveKeys, locked: boolean, now = 0, runMultiplier = DEFAULT_RUN_MULTIPLIER): boolean {
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
  const running = !locked && down(keys.run);
  const speed = running ? player.speed * runMultiplier : player.speed;
  if (!locked) {
    if (down(keys.left)) { vx = -speed; facing = 'left'; }
    else if (down(keys.right)) { vx = speed; facing = 'right'; }
    else if (down(keys.up)) { vy = -speed; facing = 'up'; }
    else if (down(keys.down)) { vy = speed; facing = 'down'; }
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
