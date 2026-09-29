import Phaser from 'phaser';
import type { Action, Character, Direction, Entity, Project } from '@beze/project-schema';
import { KEYS } from '../context.js';

export interface SpawnedEntity {
  entity: Entity;
  character: Character | null;
  sprite: Phaser.Physics.Arcade.Sprite | null;
  interact: { action: Action; prompt?: string } | null;
  trigger: { zone: Phaser.GameObjects.Zone; onEnter: Action; once: boolean } | null;
  isPlayer: boolean;
  speed: number;
  facing: Direction;
  attackDamage: number;
  health: { max: number; current: number } | null;
  enemy: { speed: number; aggroRadius: number; damage: number; attackCooldownMs: number; onDefeat?: Action; nextAttackAt: number } | null;
  wander: { radius: number; speed: number; originX: number; originY: number; dirX: number; dirY: number; until: number } | null;
  /** Timestamps (ms) until which the entity is knocked back or cannot be hurt. */
  knockbackUntil: number;
  invulnerableUntil: number;
  defeated: boolean;
}

export function spawnEntity(scene: Phaser.Scene, project: Project, entity: Entity): SpawnedEntity {
  const out: SpawnedEntity = {
    entity, character: null, sprite: null, interact: null, trigger: null,
    isPlayer: false, speed: project.settings.defaultMoveSpeed, facing: entity.facing,
    attackDamage: 1, health: null, enemy: null, wander: null, knockbackUntil: 0, invulnerableUntil: 0, defeated: false,
  };
  let solid = false;
  for (const c of entity.components) {
    switch (c.type) {
      case 'sprite': {
        const character = project.characters[c.characterId];
        if (!character) break;
        out.character = character;
        const sprite = scene.physics.add.sprite(entity.x, entity.y, KEYS.character(character.id), character.animations.idle_down.frames[0]);
        sprite.setOrigin(0, 0);
        sprite.body?.setSize(character.collider.width, character.collider.height).setOffset(character.collider.offsetX, character.collider.offsetY);
        sprite.setDepth(entity.y + character.frameHeight);
        sprite.play(KEYS.animation(character.id, `idle_${entity.facing}`));
        out.sprite = sprite;
        break;
      }
      case 'body':
        solid = c.solid;
        break;
      case 'playerControl':
        out.isPlayer = true;
        if (c.speed !== undefined) out.speed = c.speed;
        if (c.attackDamage !== undefined) out.attackDamage = c.attackDamage;
        break;
      case 'health':
        out.health = { max: c.max, current: c.max };
        break;
      case 'enemy': {
        const enemy: SpawnedEntity['enemy'] = { speed: c.speed, aggroRadius: c.aggroRadius, damage: c.damage, attackCooldownMs: c.attackCooldownMs, nextAttackAt: 0 };
        if (c.onDefeat) enemy.onDefeat = c.onDefeat;
        out.enemy = enemy;
        break;
      }
      case 'wander':
        out.wander = { radius: c.radius, speed: c.speed, originX: entity.x, originY: entity.y, dirX: 0, dirY: 0, until: 0 };
        break;
      case 'interactable':
        out.interact = c.prompt !== undefined ? { action: c.action, prompt: c.prompt } : { action: c.action };
        break;
      case 'trigger': {
        const zone = scene.add.zone(entity.x, entity.y, c.width, c.height).setOrigin(0, 0);
        scene.physics.add.existing(zone, true);
        out.trigger = { zone, onEnter: c.onEnter, once: c.once };
        break;
      }
    }
  }
  if (out.sprite) {
    if (!out.isPlayer) {
      out.sprite.setImmovable(true);
      if (!solid && out.sprite.body) out.sprite.body.enable = false;
    } else {
      out.sprite.setCollideWorldBounds(true);
    }
  }
  return out;
}
