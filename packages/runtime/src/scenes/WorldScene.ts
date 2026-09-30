import Phaser from 'phaser';
import type { Action, Direction, Scene, TileMap } from '@beze/project-schema';
import { ctxOf, KEYS, SCENE_KEYS, type OverlayKey } from '../context.js';
import { buildTilemap, type BuiltMap } from '../world/buildTilemap.js';
import { placeSprite, spawnEntity, spriteTop, swapCharacter, type SpawnedEntity } from '../world/spawnEntity.js';
import { createMoveKeys, DEFAULT_RUN_MULTIPLIER, setFacing, updatePlayer, type MoveKeys } from '../systems/playerControl.js';
import { inputOf, readMove, type Button, type VirtualInput } from '../systems/input.js';
import { findInteractable } from '../systems/interaction.js';
import { SmoothCamera } from '../systems/camera.js';
import { updateEnemy } from '../systems/enemy.js';
import { updateWander } from '../systems/wander.js';
import { CombatSystem } from '../systems/combat.js';
import { WebSystem } from '../systems/web.js';
import { Lighting } from '../systems/lighting.js';
import { clockHour } from '../systems/atmosphere.js';
import { Effects } from '../systems/effects.js';
import { drawPanel, keycap, TEXT, UI, UI_SCALE } from '../ui/theme.js';
import { HealthBars } from '../systems/healthBar.js';
import { updateBreathing } from '../systems/idle.js';
import { playIdle } from '../systems/animation.js';
import { evaluateCondition } from '../dialogue/interpreter.js';
import { setVariable } from '../state/GameState.js';
import { advanceClock, buyProperty, formatDelta, formatMoney, variableLabel } from '../systems/economy.js';
import { completeQuestStep, startQuest, tickQuests, type QuestEvent } from '../systems/quests.js';
import type { CardKind, HudScene, NotifyKind } from './HudScene.js';
import type { MarkerEntry } from './MapScene.js';
import type { ShopInit } from './ShopScene.js';

export interface WorldInit {
  sceneId: string;
  spawn?: { x: number; y: number; facing?: Direction | undefined } | undefined;
}

const INTERACT_CODES = { E: Phaser.Input.Keyboard.KeyCodes.E, SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER } as const;
const ATTACK_CODES = { SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, X: Phaser.Input.Keyboard.KeyCodes.X, J: Phaser.Input.Keyboard.KeyCodes.J, K: Phaser.Input.Keyboard.KeyCodes.K } as const;
const ABILITY_CODES = {
  X: Phaser.Input.Keyboard.KeyCodes.X, C: Phaser.Input.Keyboard.KeyCodes.C, F: Phaser.Input.Keyboard.KeyCodes.F, Q: Phaser.Input.Keyboard.KeyCodes.Q,
  Z: Phaser.Input.Keyboard.KeyCodes.Z, J: Phaser.Input.Keyboard.KeyCodes.J, K: Phaser.Input.Keyboard.KeyCodes.K,
} as const;
/** Dust puffs this often while zipping along a web line. */
const ZIP_DUST_MS = 60;
const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
/** Interval between dust puffs while running. */
const DUST_MS = 250;
/** Quest conditions and lock conditions are re-checked this often (and right after any variable change). */
const CONDITION_CHECK_MS = 250;
/** Coming this close (px, centre to centre) to a map marker discovers it. */
const DISCOVER_RADIUS = 48;
/** A looping emote plays this long when `playAnimation` gives no duration. */
const LOOP_EMOTE_MS = 1200;
const GOLD_TINTS = [0xf6c343, 0xfff3b0, 0xffffff, 0xffd166];

/** One Phaser scene reused for every project scene. Restarted on `changeScene`. */
export class WorldScene extends Phaser.Scene {
  private sceneData!: Scene;
  private built: BuiltMap | null = null;
  private entities: SpawnedEntity[] = [];
  private player: SpawnedEntity | null = null;
  /** Solid NPC/enemy sprites and lock barriers the player collides with, and the sprites that move against the
   *  tilemap. Plain arrays, not physics groups: groups re-apply their defaults (immovable = false) to members. */
  private solids: Phaser.GameObjects.GameObject[] = [];
  private movers: Phaser.Physics.Arcade.Sprite[] = [];
  private keys!: MoveKeys;
  private virtual!: VirtualInput;
  private unsubscribePress: (() => void) | null = null;
  private interactKey!: Phaser.Input.Keyboard.Key;
  /** Interaction prompt: a keycap and a label, drawn in screen space over the target. */
  private prompt!: Phaser.GameObjects.Container;
  private promptLabel!: Phaser.GameObjects.Text;
  private promptCap!: Phaser.GameObjects.Container;
  private promptText = '';
  /** True while the camera fades out towards another scene; input is ignored. */
  private leaving = false;
  private combat!: CombatSystem;
  private web!: WebSystem;
  private lighting!: Lighting;
  private effects!: Effects;
  private healthBars!: HealthBars;
  private camera: SmoothCamera | null = null;
  private bySprite = new Map<Phaser.GameObjects.GameObject, SpawnedEntity>();
  private gameOver = false;
  private nextDustAt = 0;
  private nextConditionCheckAt = 0;
  /** The overlay (pause, map, inventory, shop) that currently owns input, while this scene is paused. */
  private overlay: OverlayKey | null = null;
  /** True while a dialogue overlay owns input. */
  dialogueActive = false;

  constructor() {
    super(SCENE_KEYS.world);
  }

  init(data: WorldInit): void {
    const ctx = ctxOf(this);
    const scene = ctx.project.scenes[data.sceneId];
    if (!scene) throw new Error(`scene "${data.sceneId}" does not exist`);
    this.sceneData = scene;
    ctx.state.currentSceneId = scene.id;
    this.entities = [];
    this.player = null;
    this.built = null;
    this.solids = [];
    this.movers = [];
    this.dialogueActive = false;
    this.gameOver = false;
    this.nextDustAt = 0;
    this.nextConditionCheckAt = 0;
    this.overlay = null;
    this.camera = null;
    this.leaving = false;
    this.bySprite = new Map();
    this.registry.set('spawn', data.spawn ?? null);
  }

  create(): void {
    const ctx = ctxOf(this);
    const { project, state } = ctx;
    const scene = this.sceneData;
    const cam = this.cameras.main;
    cam.setBackgroundColor(project.settings.backgroundColor);
    // The canvas is UI_SCALE× the viewport; the world zooms to match, so a tile still covers the same screen area.
    cam.setZoom(UI_SCALE);
    this.anims.globalTimeScale = 1;
    const presentation = project.settings.presentation;
    if (this.sys.game.renderer.type === Phaser.WEBGL && ctx.quality !== 'low') {
      if (presentation?.vignette !== false) cam.postFX.addVignette(0.5, 0.5, 0.92, 0.32);
      if (presentation?.bloom !== false) cam.postFX.addBloom(0xffffff, 1, 1, 1, 0.3, 3);
    }
    this.lighting = new Lighting(this, project, ctx.quality);

    if (scene.backgroundAssetId && this.textures.exists(KEYS.image(scene.backgroundAssetId))) {
      this.add.image(0, 0, KEYS.image(scene.backgroundAssetId)).setOrigin(0, 0).setDepth(-1);
    }

    const map = scene.mapId ? project.maps[scene.mapId] : undefined;
    if (map) {
      this.built = buildTilemap(this, project, map);
      this.physics.world.setBounds(0, 0, this.built.widthPx, this.built.heightPx);
      this.lighting.attachMap(this.built);
      this.lighting.addLampsFromMap(project, map);
    }

    for (const id of scene.entityOrder) {
      const entity = scene.entities[id];
      if (!entity) continue;
      const key = `${scene.id}:${entity.id}`;
      if (state.defeated.includes(key) || state.removed.includes(key)) continue;
      // Collected once-pickups stay collected; a lock whose condition already holds is already open.
      if (entity.components.some((c) => (c.type === 'pickup' && c.once && state.picked.includes(key)) || (c.type === 'lock' && evaluateCondition(c.condition, state.variables)))) continue;
      const spawned = this.register(spawnEntity(this, project, entity, { characterId: state.playerCharacterId, speed: state.playerSpeed }));
      if (spawned.isPlayer) this.player = spawned;
    }

    this.effects = new Effects(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.effects.dispose());
    this.healthBars = new HealthBars(this);
    this.combat = new CombatSystem(this, this.effects, {
      onPlayerHurt: () => {
        this.cameras.main.shake(120, 0.004);
        this.effects.hurtFlash();
      },
      onDefeated: (e) => {
        state.defeated.push(`${scene.id}:${e.entity.id}`);
        this.effects.zoomPulse();
        if (e.enemy?.onDefeat) this.runAction(e.enemy.onDefeat);
      },
      onPlayerDefeated: () => this.showGameOver(),
    });
    this.web = new WebSystem(this, this.effects, this.combat, {
      onZip: () => this.effects.zoomPulse(0.03, 110),
      onFizzle: () => { /* the line itself shows the miss */ },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.web.dispose());
    for (const e of this.entities) {
      this.lighting.attach(e.sprite);
      this.lighting.attach(e.visual);
      if (e.light) {
        const c = this.centerOf(e, project.settings.tileSize);
        this.lighting.add(c.x, c.y - (e.character ? e.character.frameHeight * 0.4 : 0), e.light.radius, e.light.color, e.light.intensity, e.light.night, e.light.flicker);
      }
    }

    const spawn = this.registry.get('spawn') as WorldInit['spawn'] | null;
    if (this.player?.sprite && spawn) {
      placeSprite(this.player, spawn.x, spawn.y);
      if (spawn.facing) setFacing(this.player, spawn.facing);
    }

    if (this.built?.collision) this.physics.add.collider(this.movers, this.built.collision);
    if (this.player?.sprite) {
      this.physics.add.collider(this.player.sprite, this.solids, (_p, other) => {
        const e = this.bySprite.get(other as Phaser.GameObjects.GameObject);
        if (e?.enemy && this.player) this.combat.enemyTouch(e, this.player, this.time.now);
      });
      // A climbing player walks over climbable cells (roofs, walls); everyone else treats them as solid.
      const playerCollision = this.player.climb && this.built?.climberCollision ? this.built.climberCollision : this.built?.collision;
      if (playerCollision) this.physics.add.collider(this.player.sprite, playerCollision);
      for (const e of this.entities) {
        if (e.trigger) {
          const key = `${scene.id}:${e.entity.id}`;
          this.physics.add.overlap(this.player.sprite, e.trigger.zone, () => {
            if (this.dialogueActive) return;
            if (e.trigger!.once) {
              if (state.firedTriggers.includes(key)) return;
              state.firedTriggers.push(key);
            }
            this.runAction(e.trigger!.onEnter);
          });
        }
        if (e.pickup) this.physics.add.overlap(this.player.sprite, e.pickup.zone, () => this.collect(e));
      }
    }

    const keyboard = this.input.keyboard!;
    this.keys = createMoveKeys(keyboard);
    this.virtual = inputOf(this);
    this.interactKey = keyboard.addKey(INTERACT_CODES[project.settings.interactKey]);
    // Event-driven so a tap shorter than one frame still counts.
    this.interactKey.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => { if (!event.repeat) this.interact(); });
    const attackKey = keyboard.addKey(ATTACK_CODES[project.settings.attackKey]);
    attackKey.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => { if (!event.repeat) this.attack(); });
    if (this.player?.ability) {
      const abilityKey = keyboard.addKey(ABILITY_CODES[project.settings.abilityKey ?? 'X']);
      abilityKey.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => { if (!event.repeat) this.useAbility(); });
    }
    const K = Phaser.Input.Keyboard.KeyCodes;
    keyboard.on('keydown-M', (event: KeyboardEvent) => { if (!event.repeat) this.openOverlay(SCENE_KEYS.map); });
    keyboard.on('keydown-I', (event: KeyboardEvent) => { if (!event.repeat) this.openOverlay(SCENE_KEYS.inventory); });
    keyboard.on('keydown-ESC', (event: KeyboardEvent) => { if (!event.repeat) this.openOverlay(SCENE_KEYS.pause); });
    keyboard.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT, K.SPACE, K.SHIFT]);
    this.unsubscribePress = this.virtual.onPress((b) => this.onVirtualPress(b));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.unsubscribePress?.(); this.unsubscribePress = null; });

    const width = this.built?.widthPx ?? project.settings.viewport.width;
    const height = this.built?.heightPx ?? project.settings.viewport.height;
    this.camera = new SmoothCamera(this, this.cameras.main, this.player, width, height);

    // Screen-space prompt (keycap + label), repositioned over the target each frame.
    const promptBack = this.add.graphics();
    this.promptCap = keycap(this, 0, 0, project.settings.interactKey === 'SPACE' ? 'SPACE' : project.settings.interactKey, 22);
    this.promptLabel = this.add.text(0, 0, '', { ...TEXT.bold, fontSize: '15px' }).setOrigin(0, 0.5);
    this.prompt = this.add.container(0, 0, [promptBack, this.promptCap, this.promptLabel]).setScrollFactor(0).setDepth(20_000).setVisible(false);
    this.prompt.setData('back', promptBack);

    cam.fadeIn(380, 5, 6, 12);
    ctx.emit({ type: 'sceneChanged', sceneId: scene.id });
  }

  /** Adds a spawned entity to the scene's bookkeeping (entity list, sprite lookup, collision arrays). */
  private register(spawned: SpawnedEntity): SpawnedEntity {
    this.entities.push(spawned);
    if (spawned.sprite) this.bySprite.set(spawned.sprite, spawned);
    if (this.lighting) { this.lighting.attach(spawned.sprite); this.lighting.attach(spawned.visual); }
    if (!spawned.isPlayer && spawned.sprite) {
      if (spawned.sprite.body?.enable) this.solids.push(spawned.sprite);
      if (spawned.wander || spawned.enemy) this.movers.push(spawned.sprite);
    }
    if (spawned.lock?.blocker) this.solids.push(spawned.lock.blocker);
    return spawned;
  }

  override update(_time: number, delta: number): void {
    const now = this.time.now;
    const ctx = ctxOf(this);
    for (const e of this.entities) {
      if (e.isPlayer || e.defeated) continue;
      if (e.enemy) updateEnemy(this, e, this.dialogueActive ? null : this.player, now);
      else if (e.wander) updateWander(e, now);
    }
    if (this.player) {
      const runMultiplier = ctx.project.settings.runSpeedMultiplier ?? DEFAULT_RUN_MULTIPLIER;
      const running = updatePlayer(this.player, readMove(this.keys, this.virtual), this.dialogueActive || this.gameOver, now, runMultiplier);
      const zipping = now < this.player.zipUntil;
      if ((running || zipping) && now >= this.nextDustAt && this.player.sprite?.body) {
        const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
        const [dx, dy] = DIR[this.player.facing];
        this.effects.dust(body.center.x - dx * body.width * 0.5, body.bottom - 2 - dy * body.height * 0.5, this.player.facing);
        this.nextDustAt = now + (zipping ? ZIP_DUST_MS : DUST_MS);
      }
      if (this.player.senseRadius > 0) this.checkSense(now);
    }
    this.web.update(now);
    for (const e of this.entities) updateBreathing(e, now);
    this.healthBars.update(this.entities);
    this.lighting.update(now, clockHour(ctx.project, ctx.state.clock.elapsedMs));
    if (!this.gameOver) this.tickWorld(delta, now);
    if (!this.player) return;
    if (this.dialogueActive || this.gameOver || this.leaving) {
      this.prompt.setVisible(false);
      return;
    }
    const target = findInteractable(this.player, this.entities, ctx.project.settings.tileSize);
    if (target) {
      const text = this.promptFor(target);
      if (text !== this.promptText) {
        this.promptText = text;
        this.promptLabel.setText(text).setPosition(18, 0);
        const back = this.prompt.getData('back') as Phaser.GameObjects.Graphics;
        const w = this.promptLabel.width + 52;
        back.clear();
        drawPanel(back, -22, -17, w, 34, { radius: 17, alpha: 0.86 });
        this.prompt.setSize(w, 34);
      }
      const anchorX = target.sprite ? target.sprite.x + (target.character?.frameWidth ?? 32) / 2 : target.entity.x + ctx.project.settings.tileSize / 2;
      const anchorY = target.sprite ? spriteTop(target) - 10 : target.entity.y - 10;
      const cam = this.cameras.main;
      const sx = (anchorX - cam.worldView.x) * cam.zoom;
      const sy = (anchorY - cam.worldView.y) * cam.zoom;
      this.prompt.setPosition(Math.round(sx - this.prompt.width / 2 + 22), Math.round(sy - 20));
      this.prompt.setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
  }

  /** The player's hearts for the HUD, or null when the player has no health. */
  playerHealth(): { current: number; max: number } | null {
    const h = this.player?.health;
    return h ? { current: h.current, max: h.max } : null;
  }

  /** Ability cooldown for the HUD chip, or null when the player has no ability. */
  abilityStatus(): { left: number; total: number } | null {
    const ability = this.player?.ability;
    if (!ability || !this.web) return null;
    return { left: this.web.cooldownLeft(this.time.now), total: ability.cooldownMs };
  }

  /** The day clock, property income, quest conditions and timers, locks and marker discovery. */
  private tickWorld(delta: number, now: number): void {
    const ctx = ctxOf(this);
    const { project, state } = ctx;
    const economy = project.settings.economy;
    for (const r of advanceClock(project, state, delta)) {
      if (economy && r.income > 0) this.notify(`Day ${r.day} · Property income ${formatDelta(r.income, economy.currencyPrefix)}`, 'reward');
      else this.notify(`Day ${r.day} begins`, 'info');
    }
    if (now >= this.nextConditionCheckAt) {
      this.nextConditionCheckAt = now + CONDITION_CHECK_MS;
      this.checkConditions();
    }
    this.checkDiscovery();
  }

  /** Runs after any variable change and on the 250 ms cadence: quest steps, timers and locks. */
  onVariablesChanged(): void {
    this.nextConditionCheckAt = this.time.now + CONDITION_CHECK_MS;
    this.checkConditions();
  }

  private checkConditions(): void {
    const { project, state } = ctxOf(this);
    this.handleQuestEvents(tickQuests(project, state, state.clock.elapsedMs));
    for (const e of [...this.entities]) {
      if (e.lock && !e.defeated && evaluateCondition(e.lock.condition, state.variables)) this.unlock(e);
    }
  }

  private checkDiscovery(): void {
    const player = this.player;
    const body = player?.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (!player || !body) return;
    const { project, state } = ctxOf(this);
    const T = project.settings.tileSize;
    for (const e of this.entities) {
      if (!e.marker || e.marker.discoverXp === undefined) continue;
      const key = `${this.sceneData.id}:${e.entity.id}`;
      if (state.discovered.includes(key)) continue;
      const c = this.centerOf(e, T);
      if (Math.hypot(c.x - body.center.x, c.y - body.center.y) > DISCOVER_RADIUS) continue;
      state.discovered.push(key);
      const xp = e.marker.discoverXp;
      const xpVar = project.settings.economy?.xpVariableId;
      if (xp > 0 && xpVar) setVariable(state, xpVar, 'add', xp);
      this.card('location', e.marker.label, xp > 0 && xpVar ? `+${xp} XP` : '');
      this.effects.sparks(c.x, c.y - T / 2, 0, 0, [0xcfe3ff, 0xffffff, 0x6fc3ff]);
      this.onVariablesChanged();
    }
  }

  private centerOf(e: SpawnedEntity, tileSize: number): { x: number; y: number } {
    const body = e.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) return { x: body.center.x, y: body.center.y };
    return { x: e.entity.x + tileSize / 2, y: e.entity.y + tileSize / 2 };
  }

  private promptFor(e: SpawnedEntity): string {
    const { project, state } = ctxOf(this);
    const economy = project.settings.economy;
    const money = (n: number) => (economy ? formatMoney(n, economy.currencyPrefix) : String(n));
    if (e.property) {
      return state.variables[e.property.ownedVariableId] === true
        ? `Owned · +${money(e.property.incomePerDay)}/day`
        : `Buy ${e.property.name} · ${money(e.property.price)}`;
    }
    if (e.shop) return e.shop.name;
    if (e.lock) return 'Locked';
    return e.interact?.prompt ?? 'Talk';
  }

  /** The interact key: the thing in front of the player, or dismounting when there is nothing. */
  private interact(): void {
    if (this.dialogueActive || this.overlay || this.gameOver || this.leaving || !this.player) return;
    const ctx = ctxOf(this);
    const target = findInteractable(this.player, this.entities, ctx.project.settings.tileSize);
    if (!target) {
      if (ctx.state.playerCharacterId) this.dismount();
      return;
    }
    if (target.property) this.buy(target);
    else if (target.shop) this.openOverlay(SCENE_KEYS.shop, { shop: target.shop } satisfies ShopInit);
    else if (target.lock) this.notify(target.lock.lockedText, 'warning');
    else if (target.interact) this.runAction(target.interact.action);
  }

  private attack(): void {
    if (this.dialogueActive || this.overlay || this.leaving || !this.player) return;
    if (this.gameOver) { this.retry(); return; }
    this.combat.swing(this.player, this.entities, this.time.now, ctxOf(this).project.settings.tileSize);
  }

  /** The ability key: the player's special move (the web line). */
  private useAbility(): void {
    if (this.dialogueActive || this.overlay || this.gameOver || this.leaving || !this.player?.ability) return;
    this.web.fire(this.player, this.player.ability, this.entities, this.currentMap(), this.time.now);
  }

  /** Danger sense: the first frame an enemy within range winds up an attack, arcs flash over the player's head. */
  private checkSense(now: number): void {
    const player = this.player;
    const body = player?.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (!player || !body) return;
    for (const e of this.entities) {
      const en = e.enemy;
      if (!en || e.defeated || en.phase !== 'windup' || en.sensed || !e.sprite?.body || now < e.stunnedUntil) continue;
      const eb = e.sprite.body as Phaser.Physics.Arcade.Body;
      if (Math.hypot(eb.center.x - body.center.x, eb.center.y - body.center.y) > player.senseRadius) continue;
      en.sensed = true;
      this.effects.sense(body.center.x, spriteTop(player) - 4);
    }
  }

  private onVirtualPress(b: Button): void {
    if (this.overlay || this.scene.isPaused()) return;
    switch (b) {
      case 'interact': this.interact(); break;
      case 'attack': this.attack(); break;
      case 'ability': this.useAbility(); break;
      case 'map': this.openOverlay(SCENE_KEYS.map); break;
      case 'inventory': this.openOverlay(SCENE_KEYS.inventory); break;
      case 'pause': this.openOverlay(SCENE_KEYS.pause); break;
      default: break;
    }
  }

  private buy(e: SpawnedEntity): void {
    const { project, state } = ctxOf(this);
    const economy = project.settings.economy;
    const property = e.property;
    if (!property) return;
    if (!economy) { this.notify('This game has no economy settings.', 'warning'); return; }
    const money = (n: number) => formatMoney(n, economy.currencyPrefix);
    const r = buyProperty(state, economy, property);
    if (r.ok) {
      this.notify(`Bought ${property.name}! ${formatDelta(property.incomePerDay, economy.currencyPrefix)}/day`, 'reward');
      const c = this.centerOf(e, project.settings.tileSize);
      this.effects.sparks(c.x, c.y - 8, 0, 0, GOLD_TINTS);
      this.effects.zoomPulse(0.04, 120);
      this.emote('celebrate');
      this.onVariablesChanged();
    } else if (r.reason === 'owned') {
      this.notify(`${property.name} is yours · +${money(property.incomePerDay)}/day`, 'info');
    } else {
      this.notify(`Need ${money(r.short)} more for ${property.name}`, 'warning');
    }
  }

  /** Walking onto a pickup: add the amount, sparkle, notify, and remove it (for good when `once`). */
  private collect(e: SpawnedEntity): void {
    const pickup = e.pickup;
    if (!pickup || e.defeated || this.dialogueActive) return;
    const { project, state } = ctxOf(this);
    const key = `${this.sceneData.id}:${e.entity.id}`;
    if (pickup.once && !state.picked.includes(key)) state.picked.push(key);
    setVariable(state, pickup.variableId, 'add', pickup.amount);
    const economy = project.settings.economy;
    const isMoney = economy && pickup.variableId === economy.moneyVariableId;
    const c = this.centerOf(e, project.settings.tileSize);
    this.effects.sparks(c.x, c.y - 6, 0, 0, isMoney ? GOLD_TINTS : [0xffffff, 0xcfe3ff, 0xf6d365]);
    if (isMoney) this.notify(formatDelta(pickup.amount, economy.currencyPrefix), 'reward');
    else this.notify(`${pickup.amount >= 0 ? '+' : ''}${pickup.amount} ${variableLabel(project, pickup.variableId)}`, 'reward');
    this.despawn(e);
    this.onVariablesChanged();
  }

  /** A lock whose condition came true: burst, notify, and take the barrier out of the scene. */
  private unlock(e: SpawnedEntity): void {
    const T = ctxOf(this).project.settings.tileSize;
    const c = this.centerOf(e, T);
    this.effects.sparks(c.x, c.y, 0, 0, GOLD_TINTS);
    const flash = this.add.rectangle(c.x, c.y, T, T, 0xffffff, 0.9).setDepth(15_000);
    this.tweens.add({ targets: flash, alpha: 0, scaleX: 1.6, scaleY: 1.6, duration: 320, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    this.notify(`Unlocked: ${e.entity.name}`, 'reward');
    this.despawn(e);
  }

  /** Plays a named emote on the player when the character has it; input stays locked until it ends. */
  private emote(name: string, durationMs?: number): boolean {
    const p = this.player;
    if (!p?.sprite || !p.character || p.defeated) return false;
    const def = p.character.animations[name];
    const key = KEYS.animation(p.character.id, name);
    if (!def || !this.anims.exists(key)) return false;
    const length = (def.frames.length / def.frameRate) * 1000;
    const duration = durationMs ?? (def.loop ? LOOP_EMOTE_MS : length);
    const now = this.time.now;
    p.attackUntil = now + duration;
    p.sprite.setVelocity(0, 0);
    p.sprite.play(key);
    this.time.delayedCall(duration, () => { if (this.player === p && !p.defeated && this.time.now >= p.attackUntil) playIdle(p); });
    if (name === 'celebrate') {
      const body = p.sprite.body as Phaser.Physics.Arcade.Body;
      this.effects.sparks(body.center.x, body.center.y - body.height, 0, 0, GOLD_TINTS);
      this.time.delayedCall(160, () => { if (p.sprite) this.effects.sparks(body.center.x, body.center.y - body.height - 4, 0, 0, GOLD_TINTS); });
    }
    return true;
  }

  notify(text: string, kind: NotifyKind = 'info'): void {
    const hud = this.scene.get(SCENE_KEYS.hud) as HudScene | null;
    hud?.notify(text, kind);
  }

  /** A centred letterboxed card on the HUD (missions, discoveries, level-ups). */
  card(kind: CardKind, title: string, subtitle = ''): void {
    const hud = this.scene.get(SCENE_KEYS.hud) as HudScene | null;
    hud?.card(kind, title, subtitle);
  }

  private handleQuestEvents(events: QuestEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'started': this.card('mission', ev.quest.name, ev.quest.steps[0]?.text ?? ''); break;
        case 'advanced': this.notify(`${ev.quest.name}: ${ev.quest.steps[ev.stepIndex]?.text ?? ''}`, 'info'); break;
        case 'completed':
          this.card('complete', ev.quest.name);
          this.effects.zoomPulse(0.03, 160);
          for (const a of ev.actions) this.runAction(a);
          break;
        case 'failed':
          this.card('failed', ev.quest.name);
          for (const a of ev.actions) this.runAction(a);
          break;
      }
    }
  }

  runAction(action: Action): void {
    const ctx = ctxOf(this);
    switch (action.type) {
      case 'startDialogue': {
        if (this.dialogueActive || !ctx.project.dialogues[action.dialogueId]) return;
        this.dialogueActive = true;
        this.player?.sprite?.setVelocity(0, 0);
        this.scene.launch(SCENE_KEYS.dialogue, { dialogueId: action.dialogueId });
        break;
      }
      case 'changeScene': {
        if (!ctx.project.scenes[action.sceneId] || this.leaving) return;
        this.leaving = true;
        this.scene.stop(SCENE_KEYS.dialogue);
        this.player?.sprite?.setVelocity(0, 0);
        const cam = this.cameras.main;
        cam.fadeOut(240, 5, 6, 12);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.restart({ sceneId: action.sceneId, spawn: action.spawn } satisfies WorldInit);
        });
        break;
      }
      case 'setVariable':
        setVariable(ctx.state, action.variableId, action.op, action.value);
        this.onVariablesChanged();
        break;
      case 'setPlayerCharacter': {
        const character = ctx.project.characters[action.characterId];
        if (!character || !this.player) return;
        swapCharacter(this.player, character);
        ctx.state.playerCharacterId = action.characterId;
        ctx.state.playerSpeed = action.speed ?? null;
        this.player.speed = action.speed ?? this.player.baseSpeed;
        break;
      }
      case 'removeEntity': {
        const e = this.entities.find((x) => x.entity.id === action.entityId);
        if (!e || e.isPlayer) return;
        const key = `${this.sceneData.id}:${e.entity.id}`;
        if (!ctx.state.removed.includes(key)) ctx.state.removed.push(key);
        // The first entity removed while the player wears another character is the mount, restored on dismount.
        if (ctx.state.playerCharacterId && !ctx.state.mountEntityKey) ctx.state.mountEntityKey = key;
        this.despawn(e);
        break;
      }
      case 'notify':
        this.notify(action.text, action.kind ?? 'info');
        break;
      case 'playAnimation':
        this.emote(action.animation, action.durationMs);
        break;
      case 'startQuest': {
        const r = startQuest(ctx.project, ctx.state, action.questId, ctx.state.clock.elapsedMs);
        this.handleQuestEvents(r.events);
        break;
      }
      case 'completeQuestStep':
        this.handleQuestEvents(completeQuestStep(ctx.project, ctx.state, action.questId, action.stepId));
        break;
      case 'sequence':
        for (const a of action.actions) this.runAction(a);
        break;
    }
  }

  /** Takes an entity out of the running scene: sprite, body, trigger zone and every list it sits in. */
  private despawn(e: SpawnedEntity): void {
    this.entities = this.entities.filter((x) => x !== e);
    this.healthBars.remove(e);
    this.web.release(e);
    if (e.sprite) {
      this.bySprite.delete(e.sprite);
      this.solids = this.solids.filter((s) => s !== e.sprite);
      this.movers = this.movers.filter((s) => s !== e.sprite);
      e.sprite.destroy();
      e.sprite = null;
    }
    if (e.trigger) {
      e.trigger.zone.destroy();
      e.trigger = null;
    }
    if (e.pickup) {
      e.pickup.zone.destroy();
      e.pickup = null;
    }
    if (e.lock?.blocker) this.solids = this.solids.filter((s) => s !== e.lock!.blocker);
    if (e.visual) {
      this.tweens.killTweensOf(e.visual);
      e.visual.destroy();
      e.visual = null;
    }
    e.defeated = true;
  }

  /**
   * Interact with nothing in front while mounted: the player goes back to the document's character and speed, and
   * the mount comes back one tile ahead, facing the same way, so pressing interact again rides it.
   */
  private dismount(): void {
    const ctx = ctxOf(this);
    const player = this.player;
    if (!player?.sprite) return;
    const mountKey = ctx.state.mountEntityKey;
    ctx.state.playerCharacterId = null;
    ctx.state.playerSpeed = null;
    ctx.state.mountEntityKey = null;
    player.speed = player.baseSpeed;
    const own = player.entity.components.find((c) => c.type === 'sprite');
    const character = own && own.type === 'sprite' ? ctx.project.characters[own.characterId] : undefined;
    if (character) swapCharacter(player, character);
    if (!mountKey) return;
    const [sceneId, entityId] = mountKey.split(':') as [string, string];
    const doc = sceneId === this.sceneData.id ? this.sceneData.entities[entityId] : undefined;
    ctx.state.removed = ctx.state.removed.filter((k) => k !== mountKey);
    if (!doc) return;
    const mountSprite = doc.components.find((c) => c.type === 'sprite');
    const mountCharacter = mountSprite && mountSprite.type === 'sprite' ? ctx.project.characters[mountSprite.characterId] : undefined;
    if (!mountCharacter || !player.character) return;
    const T = ctx.project.settings.tileSize;
    const [dx, dy] = DIR[player.facing];
    const pc = player.character.collider;
    const mc = mountCharacter.collider;
    const centerX = player.sprite.x + pc.offsetX + pc.width / 2 + dx * T;
    const feetY = player.sprite.y + dy * T;
    const mount = spawnEntity(this, ctx.project, {
      ...doc,
      x: Math.round(centerX - mc.offsetX - mc.width / 2),
      y: Math.round(feetY - mountCharacter.frameHeight),
      facing: player.facing,
    });
    this.register(mount);
  }

  /** Defeat: the world slows and drains of colour, then a card with the retry key. */
  private showGameOver(): void {
    this.gameOver = true;
    const { width, height } = this.scale;
    const cam = this.cameras.main;
    this.physics.world.timeScale = 2.6;
    this.anims.globalTimeScale = 0.4;
    if (this.sys.game.renderer.type === Phaser.WEBGL && ctxOf(this).quality !== 'low') {
      const matrix = cam.postFX.addColorMatrix();
      const fade = { k: 0 };
      this.tweens.add({ targets: fade, k: 1, duration: 900, onUpdate: () => { matrix.saturate(-fade.k); matrix.brightness(1 - fade.k * 0.35, true); } });
    }
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x05060c, 0.55).setScrollFactor(0).setDepth(25_000).setAlpha(0);
    const title = this.add.text(width / 2, height / 2 - 10, 'DOWN FOR THE COUNT', { ...TEXT.display(58, UI.bad), stroke: '#0a0a14', strokeThickness: 8 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(25_001).setAlpha(0).setScale(1.3);
    const key = ctxOf(this).project.settings.attackKey;
    const cap = keycap(this, width / 2 - 60, height / 2 + 44, key, 24).setScrollFactor(0).setDepth(25_001).setAlpha(0);
    const hint = this.add.text(width / 2 - 36, height / 2 + 44, 'to get back up', { ...TEXT.body, fontSize: '18px', color: UI.muted }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(25_001).setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 600, delay: 300, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 420, delay: 700, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [cap, hint], alpha: 1, duration: 300, delay: 1100 });
  }

  private retry(): void {
    // Enemies already defeated stay defeated; the player respawns at the scene's own spawn.
    this.physics.world.timeScale = 1;
    this.anims.globalTimeScale = 1;
    this.scene.restart({ sceneId: this.sceneData.id } satisfies WorldInit);
  }

  /** Pause menu "Restart scene": same as a retry, from the scene's own spawn. */
  restartScene(): void {
    this.retry();
  }

  /** Called by the dialogue scene when it closes. */
  endDialogue(followUps: Action[]): void {
    this.dialogueActive = false;
    for (const a of followUps) this.runAction(a);
    this.onVariablesChanged();
  }

  /** Opens one of the full-screen overlays and pauses the world under it. Only one overlay runs at a time. */
  openOverlay(key: OverlayKey, data?: object): void {
    if (this.overlay || this.dialogueActive || this.gameOver || this.scene.isPaused()) return;
    this.overlay = key;
    this.player?.sprite?.setVelocity(0, 0);
    this.virtual.setDirection(null);
    this.scene.launch(key, data);
    this.scene.pause();
  }

  /** Called by an overlay when it closes: the world runs again. */
  closeOverlay(): void {
    this.overlay = null;
    if (this.scene.isPaused()) this.scene.resume();
  }

  /** The overlay that owns input right now, or null. */
  get activeOverlay(): OverlayKey | null {
    return this.overlay;
  }

  currentMap(): TileMap | null {
    const { project } = ctxOf(this);
    return this.sceneData.mapId ? project.maps[this.sceneData.mapId] ?? null : null;
  }

  /** Centre of the player's collider in world space, for the map screen. */
  playerCenter(): { x: number; y: number } | null {
    const body = this.player?.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    return body ? { x: body.center.x, y: body.center.y } : null;
  }

  /** Every map marker in this scene, with whether the player has discovered it (markers without discovery XP count as known). */
  markerEntries(): MarkerEntry[] {
    const { project, state } = ctxOf(this);
    const T = project.settings.tileSize;
    const out: MarkerEntry[] = [];
    for (const id of this.sceneData.entityOrder) {
      const entity = this.sceneData.entities[id];
      const marker = entity?.components.find((c) => c.type === 'mapMarker');
      if (!entity || !marker || marker.type !== 'mapMarker') continue;
      const key = `${this.sceneData.id}:${entity.id}`;
      const live = this.entities.find((e) => e.entity.id === entity.id);
      const c = live ? this.centerOf(live, T) : { x: entity.x + T / 2, y: entity.y + T / 2 };
      out.push({ key, x: c.x, y: c.y, label: marker.label, icon: marker.icon ?? 'place', discovered: marker.discoverXp === undefined || state.discovered.includes(key) });
    }
    return out;
  }
}
