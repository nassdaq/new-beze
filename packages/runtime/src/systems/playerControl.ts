import Phaser from 'phaser';
import type { Direction } from '@beze/project-schema';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { KEYS } from '../context.js';

export interface MoveKeys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
}

export function createMoveKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): MoveKeys {
  const K = Phaser.Input.Keyboard.KeyCodes;
  const add = (...codes: number[]) => codes.map((c) => keyboard.addKey(c));
  return { up: add(K.UP, K.W), down: add(K.DOWN, K.S), left: add(K.LEFT, K.A), right: add(K.RIGHT, K.D) };
}

const down = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);

/** Four-direction movement. Horizontal wins over vertical; no diagonals in v1. */
export function updatePlayer(player: SpawnedEntity, keys: MoveKeys, locked: boolean, now = 0): void {
  const sprite = player.sprite;
  const character = player.character;
  if (!sprite || !character || player.defeated) return;
  if (now < player.knockbackUntil) {
    sprite.setDepth(sprite.y + character.frameHeight);
    return;
  }
  let vx = 0;
  let vy = 0;
  let facing: Direction | null = null;
  if (!locked) {
    if (down(keys.left)) { vx = -player.speed; facing = 'left'; }
    else if (down(keys.right)) { vx = player.speed; facing = 'right'; }
    else if (down(keys.up)) { vy = -player.speed; facing = 'up'; }
    else if (down(keys.down)) { vy = player.speed; facing = 'down'; }
  }
  sprite.setVelocity(vx, vy);
  if (facing) player.facing = facing;
  const moving = vx !== 0 || vy !== 0;
  const anim = KEYS.animation(character.id, `${moving ? 'walk' : 'idle'}_${player.facing}`);
  if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim, true);
  sprite.setDepth(sprite.y + character.frameHeight);
}

export function setFacing(player: SpawnedEntity, facing: Direction): void {
  player.facing = facing;
  if (player.sprite && player.character) player.sprite.play(KEYS.animation(player.character.id, `idle_${facing}`), true);
}
