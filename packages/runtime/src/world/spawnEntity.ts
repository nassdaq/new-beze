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
}

export function spawnEntity(scene: Phaser.Scene, project: Project, entity: Entity): SpawnedEntity {
  const out: SpawnedEntity = {
    entity, character: null, sprite: null, interact: null, trigger: null,
    isPlayer: false, speed: project.settings.defaultMoveSpeed, facing: entity.facing,
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
      case 'wander':
        break; // milestone 2
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
