import Phaser from 'phaser';
import type { Ability, Action, Character, Condition, Direction, Entity, Project } from '@beze/project-schema';
import { KEYS } from '../context.js';
import { ensurePlaceholder } from './placeholders.js';

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
  /** The entity's own move speed (its `playerControl.speed` or the project default), before any `setPlayerCharacter` override. */
  baseSpeed: number;
  facing: Direction;
  attackDamage: number;
  /** v4 player abilities: the special move on the ability key, wall/roof climbing and the danger-sense radius (0 = off). */
  ability: Ability | null;
  climb: boolean;
  senseRadius: number;
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
    /** True once the player's danger sense has flashed for the current wind-up. */
    sensed: boolean;
    /** A tough enemy at half health: faster, angrier (see combat.ts). */
    enraged: boolean;
  } | null;
  wander: { radius: number; speed: number; originX: number; originY: number; dirX: number; dirY: number; until: number } | null;
  /** v3 city components. Each is data straight from the document plus the runtime objects it needs. */
  property: { name: string; price: number; incomePerDay: number; ownedVariableId: string; description?: string } | null;
  shop: { name: string; sells: Array<{ variableId: string; price: number }>; buys: Array<{ variableId: string; price: number }> } | null;
  /** `zone` is the overlap body: the sprite's frame, or the placeholder tile. */
  pickup: { variableId: string; amount: number; once: boolean; zone: Phaser.GameObjects.Zone } | null;
  /** `blocker` is the static body of a sprite-less lock (a barrier); a lock with a sprite blocks through its sprite. */
  lock: { condition: Condition; lockedText: string; blocker: Phaser.GameObjects.Image | null } | null;
  marker: { label: string; icon?: string; discoverXp?: number } | null;
  /** v4: a point light carried by the entity (created by the world's lighting system). */
  light: { color: number; radius: number; intensity: number; night: boolean; flicker: boolean } | null;
  /** Code-drawn stand-in (sign, coin, parcel, barrier) for an entity without a sprite; destroyed with the entity. */
  visual: Phaser.GameObjects.Image | null;
  /** Timestamps (ms) until which the entity is knocked back, cannot be hurt, or is committed to a swing. */
  knockbackUntil: number;
  invulnerableUntil: number;
  attackUntil: number;
  /** v4: the player is flying along a web line; input is ignored and the velocity is the zip's. */
  zipUntil: number;
  /** v4: an enemy webbed by the player: frozen, cannot attack, takes double melee damage. */
  stunnedUntil: number;
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

/** What `setPlayerCharacter` left in the game state: applied to the player entity when it spawns. */
export interface PlayerOverride {
  characterId: string | null;
  speed: number | null;
}

/**
 * Re-skins a spawned entity as another character: texture, animations, collider. The feet line and the collider's
 * horizontal centre stay where they were, so a swap mid-scene does not teleport the entity.
 */
export function swapCharacter(e: SpawnedEntity, character: Character): void {
  const sprite = e.sprite;
  const old = e.character;
  if (!sprite || !old) return;
  const centerX = sprite.x + old.collider.offsetX + old.collider.width / 2;
  const feetY = sprite.y;
  sprite.anims.stop();
  sprite.setTexture(KEYS.character(character.id), character.animations.idle_down.frames[0]);
  sprite.setOrigin(0, 1);
  sprite.body?.setSize(character.collider.width, character.collider.height).setOffset(character.collider.offsetX, character.collider.offsetY);
  sprite.setPosition(centerX - character.collider.offsetX - character.collider.width / 2, feetY);
  sprite.setDepth(sprite.y);
  e.character = character;
  sprite.play(KEYS.animation(character.id, `idle_${e.facing}`), true);
}

export function spawnEntity(scene: Phaser.Scene, project: Project, entity: Entity, override?: PlayerOverride): SpawnedEntity {
  const out: SpawnedEntity = {
    entity, character: null, sprite: null, interact: null, trigger: null,
    isPlayer: false, speed: project.settings.defaultMoveSpeed, baseSpeed: project.settings.defaultMoveSpeed, facing: entity.facing,
    attackDamage: 1, ability: null, climb: false, senseRadius: 0,
    health: null, enemy: null, wander: null, knockbackUntil: 0, invulnerableUntil: 0, attackUntil: 0, zipUntil: 0, stunnedUntil: 0,
    breathPhase: Math.random() * Math.PI * 2, breathing: false, defeated: false,
    property: null, shop: null, pickup: null, lock: null, marker: null, visual: null, light: null,
  };
  let solid = false;
  const T = project.settings.tileSize;
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
        out.baseSpeed = out.speed;
        if (c.attackDamage !== undefined) out.attackDamage = c.attackDamage;
        if (c.ability) out.ability = c.ability;
        out.climb = c.climb ?? false;
        out.senseRadius = c.senseRadius ?? 0;
        break;
      case 'health':
        out.health = { max: c.max, current: c.max };
        break;
      case 'enemy': {
        const enemy: SpawnedEntity['enemy'] = {
          speed: c.speed, aggroRadius: c.aggroRadius, damage: c.damage, attackCooldownMs: c.attackCooldownMs,
          nextAttackAt: 0, phase: 'chase', phaseUntil: 0, struck: false, telegraph: null, sensed: false, enraged: false,
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
      case 'property':
        out.property = c.description !== undefined
          ? { name: c.name, price: c.price, incomePerDay: c.incomePerDay, ownedVariableId: c.ownedVariableId, description: c.description }
          : { name: c.name, price: c.price, incomePerDay: c.incomePerDay, ownedVariableId: c.ownedVariableId };
        break;
      case 'shop':
        out.shop = { name: c.name, sells: c.sells, buys: c.buys };
        break;
      case 'pickup': {
        const zone = scene.add.zone(entity.x, entity.y, T, T).setOrigin(0, 0);
        scene.physics.add.existing(zone, true);
        out.pickup = { variableId: c.variableId, amount: c.amount, once: c.once, zone };
        break;
      }
      case 'lock':
        out.lock = { condition: c.condition, lockedText: c.lockedText, blocker: null };
        break;
      case 'light':
        out.light = { color: parseInt(c.color.slice(1), 16), radius: c.radius, intensity: c.intensity, night: c.night ?? false, flicker: c.flicker ?? false };
        break;
      case 'mapMarker': {
        const marker: SpawnedEntity['marker'] = { label: c.label };
        if (c.icon !== undefined) marker.icon = c.icon;
        if (c.discoverXp !== undefined) marker.discoverXp = c.discoverXp;
        out.marker = marker;
        break;
      }
    }
  }
  // A lock always blocks, whatever its body component says.
  if (out.lock) solid = true;
  // The pickup's overlap zone hugs the sprite's collider when it has one.
  if (out.pickup && out.sprite && out.character) {
    const col = out.character.collider;
    out.pickup.zone.setPosition(entity.x + col.offsetX - 4, entity.y + col.offsetY - 4).setSize(col.width + 8, col.height + 8);
    (out.pickup.zone.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
  }
  if (!out.sprite) out.visual = spawnPlaceholder(scene, out, T, project.settings.economy?.moneyVariableId);
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
  if (out.lock && !out.sprite && out.visual) {
    scene.physics.add.existing(out.visual, true);
    out.lock.blocker = out.visual;
  }
  if (out.isPlayer && override) {
    const character = override.characterId ? project.characters[override.characterId] : undefined;
    if (character) swapCharacter(out, character);
    if (override.speed !== null) out.speed = override.speed;
  }
  return out;
}

/**
 * Stand-in visual for a sprite-less city entity: a barrier tile for a lock, a coin or parcel for a pickup, a hanging
 * sign for a property or shop. Pickups and signs bob gently so they read as things to walk up to.
 */
function spawnPlaceholder(scene: Phaser.Scene, e: SpawnedEntity, tileSize: number, moneyVariableId: string | undefined): Phaser.GameObjects.Image | null {
  const { x, y } = e.entity;
  if (e.lock) {
    const key = ensurePlaceholder(scene, 'barrier', tileSize);
    return scene.add.image(x, y, key).setOrigin(0, 0).setDepth(y + tileSize);
  }
  if (e.pickup) {
    const key = ensurePlaceholder(scene, e.pickup.variableId === moneyVariableId ? 'coin' : 'parcel');
    const img = scene.add.image(x + tileSize / 2, y + tileSize / 2, key).setDepth(y + tileSize);
    scene.tweens.add({ targets: img, y: img.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return img;
  }
  if (e.property || e.shop) {
    const key = ensurePlaceholder(scene, e.property ? 'sign_property' : 'sign_shop');
    const img = scene.add.image(x + tileSize / 2, y + tileSize / 2 - 4, key).setDepth(y + tileSize);
    scene.tweens.add({ targets: img, y: img.y - 2, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return img;
  }
  return null;
}
