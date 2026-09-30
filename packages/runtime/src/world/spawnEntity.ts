import Phaser from 'phaser';
import type { Action, Character, Direction, Entity, Project } from '@beze/project-schema';
import { KEYS } from '../context.js';

/** Where an enemy is in its attack cycle. Contact damage only lands during `lunge`. */
export type EnemyPhase = 'chase' | 'windup' | 'lunge' | 'recover';

export interface SpawnedEntity {
  entity: Entity;
  character: Character | null;
  /** Origin is bottom-left (0, 1): `sprite.y` is the feet line, `spriteTop` gives the top edge. */
  sprite: Phaser.Physics.Arcade.Sprite | null;
  interact: { action: Action; prompt?: string } | null;
  trigger: { zone: Phaser.GameObjects.Zone; onEnter: Action; once: boolean } | null;
  isPlayer: boolean;
  speed: number;
  facing: Direction;
  attackDamage: number;
  health: { max: number; current: number } | null;
  enemy: {
    speed: number; aggroRadius: number; damage: number; attackCooldownMs: number; onDefeat?: Action;
    /** Earliest time the enemy may start another wind-up. Data-driven through `attackCooldownMs`. */
    nextAttackAt: number;
    phase: EnemyPhase;
    /** When the current phase ends. */
    phaseUntil: number;
    /** True once the current lunge has landed, so one lunge hurts at most once. */
    struck: boolean;
    /** Squash/stretch tween of the telegraph, so an interrupt can reset it. */
    telegraph: Phaser.Tweens.Tween | null;
  } | null;
  wander: { radius: number; speed: number; originX: number; originY: number; dirX: number; dirY: number; until: number } | null;
  /** Timestamps (ms) until which the entity is knocked back, cannot be hurt, or is committed to a swing. */
  knockbackUntil: number;
  invulnerableUntil: number;
  attackUntil: number;
  /** Random phase so idle breathing is not synchronised across entities. */
  breathPhase: number;
  breathing: boolean;
  defeated: boolean;
}

/** Top edge of the sprite in world space (the sprite's origin is at its feet). */
export function spriteTop(e: SpawnedEntity): number {
  return e.sprite ? e.sprite.y - (e.character?.frameHeight ?? 0) : e.entity.y;
}

/** Sets the sprite so that its top-left corner is at (x, y), the coordinate system the document uses. */
export function placeSprite(e: SpawnedEntity, x: number, y: number): void {
  if (!e.sprite) return;
  e.sprite.setPosition(x, y + (e.character?.frameHeight ?? 0));
  e.sprite.setDepth(e.sprite.y);
}

export function spawnEntity(scene: Phaser.Scene, project: Project, entity: Entity): SpawnedEntity {
  const out: SpawnedEntity = {
    entity, character: null, sprite: null, interact: null, trigger: null,
    isPlayer: false, speed: project.settings.defaultMoveSpeed, facing: entity.facing,
    attackDamage: 1, health: null, enemy: null, wander: null, knockbackUntil: 0, invulnerableUntil: 0, attackUntil: 0,
    breathPhase: Math.random() * Math.PI * 2, breathing: false, defeated: false,
  };
  let solid = false;
  for (const c of entity.components) {
    switch (c.type) {
      case 'sprite': {
        const character = project.characters[c.characterId];
        if (!character) break;
        out.character = character;
        const sprite = scene.physics.add.sprite(entity.x, entity.y + character.frameHeight, KEYS.character(character.id), character.animations.idle_down.frames[0]);
        // Bottom-left origin: scale effects (breathing, squash, defeat) keep the feet on the ground.
        sprite.setOrigin(0, 1);
        sprite.body?.setSize(character.collider.width, character.collider.height).setOffset(character.collider.offsetX, character.collider.offsetY);
        sprite.setDepth(sprite.y);
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
        const enemy: SpawnedEntity['enemy'] = {
          speed: c.speed, aggroRadius: c.aggroRadius, damage: c.damage, attackCooldownMs: c.attackCooldownMs,
          nextAttackAt: 0, phase: 'chase', phaseUntil: 0, struck: false, telegraph: null,
        };
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
  if (out.wander && out.sprite) {
    // Wander measures drift against the sprite's own position, which sits at the feet.
    out.wander.originX = out.sprite.x;
    out.wander.originY = out.sprite.y;
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
