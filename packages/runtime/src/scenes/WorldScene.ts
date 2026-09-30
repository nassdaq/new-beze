import Phaser from 'phaser';
import type { Action, Direction, Scene } from '@beze/project-schema';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { buildTilemap, type BuiltMap } from '../world/buildTilemap.js';
import { placeSprite, spawnEntity, spriteTop, type SpawnedEntity } from '../world/spawnEntity.js';
import { createMoveKeys, setFacing, updatePlayer, type MoveKeys } from '../systems/playerControl.js';
import { findInteractable } from '../systems/interaction.js';
import { setupCamera } from '../systems/camera.js';
import { updateEnemy } from '../systems/enemy.js';
import { updateWander } from '../systems/wander.js';
import { CombatSystem } from '../systems/combat.js';
import { Hud } from '../systems/hud.js';
import { Effects } from '../systems/effects.js';
import { HealthBars } from '../systems/healthBar.js';
import { updateBreathing } from '../systems/idle.js';
import { setVariable } from '../state/GameState.js';

export interface WorldInit {
  sceneId: string;
  spawn?: { x: number; y: number; facing?: Direction | undefined } | undefined;
}

const INTERACT_CODES = { E: Phaser.Input.Keyboard.KeyCodes.E, SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER } as const;
const ATTACK_CODES = { SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, X: Phaser.Input.Keyboard.KeyCodes.X, J: Phaser.Input.Keyboard.KeyCodes.J, K: Phaser.Input.Keyboard.KeyCodes.K } as const;

/** One Phaser scene reused for every project scene. Restarted on `changeScene`. */
export class WorldScene extends Phaser.Scene {
  private sceneData!: Scene;
  private built: BuiltMap | null = null;
  private entities: SpawnedEntity[] = [];
  private player: SpawnedEntity | null = null;
  private keys!: MoveKeys;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private prompt!: Phaser.GameObjects.Text;
  private combat!: CombatSystem;
  private hud!: Hud;
  private effects!: Effects;
  private healthBars!: HealthBars;
  private bySprite = new Map<Phaser.GameObjects.GameObject, SpawnedEntity>();
  private gameOver = false;
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
    this.dialogueActive = false;
    this.gameOver = false;
    this.bySprite = new Map();
    this.registry.set('spawn', data.spawn ?? null);
  }

  create(): void {
    const ctx = ctxOf(this);
    const { project } = ctx;
    const scene = this.sceneData;
    this.cameras.main.setBackgroundColor(project.settings.backgroundColor);

    if (scene.backgroundAssetId && this.textures.exists(KEYS.image(scene.backgroundAssetId))) {
      this.add.image(0, 0, KEYS.image(scene.backgroundAssetId)).setOrigin(0, 0).setDepth(-1);
    }

    const map = scene.mapId ? project.maps[scene.mapId] : undefined;
    if (map) {
      this.built = buildTilemap(this, project, map);
      this.physics.world.setBounds(0, 0, this.built.widthPx, this.built.heightPx);
    }

    // A plain array, not a physics group: groups re-apply their defaults (immovable = false) to members.
    const solids: Phaser.Physics.Arcade.Sprite[] = [];
    const movers: Phaser.Physics.Arcade.Sprite[] = [];
    for (const id of scene.entityOrder) {
      const entity = scene.entities[id];
      if (!entity || ctx.state.defeated.includes(`${scene.id}:${entity.id}`)) continue;
      const spawned = spawnEntity(this, project, entity);
      this.entities.push(spawned);
      if (spawned.sprite) this.bySprite.set(spawned.sprite, spawned);
      if (spawned.isPlayer) this.player = spawned;
      else if (spawned.sprite && spawned.sprite.body?.enable) solids.push(spawned.sprite);
      if (!spawned.isPlayer && spawned.sprite && (spawned.wander || spawned.enemy)) movers.push(spawned.sprite);
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
        ctx.state.defeated.push(`${scene.id}:${e.entity.id}`);
        this.effects.zoomPulse();
        if (e.enemy?.onDefeat) this.runAction(e.enemy.onDefeat);
      },
      onPlayerDefeated: () => this.showGameOver(),
    });
    this.hud = new Hud(this);

    const spawn = this.registry.get('spawn') as WorldInit['spawn'] | null;
    if (this.player?.sprite && spawn) {
      placeSprite(this.player, spawn.x, spawn.y);
      if (spawn.facing) setFacing(this.player, spawn.facing);
    }

    if (this.built?.collision && movers.length > 0) this.physics.add.collider(movers, this.built.collision);
    if (this.player?.sprite) {
      if (solids.length > 0) {
        this.physics.add.collider(this.player.sprite, solids, (_p, other) => {
          const e = this.bySprite.get(other as Phaser.GameObjects.GameObject);
          if (e?.enemy && this.player) this.combat.enemyTouch(e, this.player, this.time.now);
        });
      }
      if (this.built?.collision) this.physics.add.collider(this.player.sprite, this.built.collision);
      for (const e of this.entities) {
        if (e.trigger) {
          const key = `${scene.id}:${e.entity.id}`;
          this.physics.add.overlap(this.player.sprite, e.trigger.zone, () => {
            if (this.dialogueActive) return;
            if (e.trigger!.once) {
              if (ctx.state.firedTriggers.includes(key)) return;
              ctx.state.firedTriggers.push(key);
            }
            this.runAction(e.trigger!.onEnter);
          });
        }
      }
    }

    const keyboard = this.input.keyboard!;
    this.keys = createMoveKeys(keyboard);
    this.interactKey = keyboard.addKey(INTERACT_CODES[project.settings.interactKey]);
    // Event-driven so a tap shorter than one frame still counts.
    this.interactKey.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
      if (event.repeat || this.dialogueActive || !this.player) return;
      const target = findInteractable(this.player, this.entities, project.settings.tileSize);
      if (target?.interact) this.runAction(target.interact.action);
    });
    const attackKey = keyboard.addKey(ATTACK_CODES[project.settings.attackKey]);
    attackKey.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
      if (event.repeat || this.dialogueActive || !this.player) return;
      if (this.gameOver) { this.retry(); return; }
      this.combat.swing(this.player, this.entities, this.time.now, project.settings.tileSize);
    });
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.SPACE]);

    const width = this.built?.widthPx ?? project.settings.viewport.width;
    const height = this.built?.heightPx ?? project.settings.viewport.height;
    setupCamera(this.cameras.main, this.player, width, height);

    this.prompt = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '10px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 1 } })
      .setDepth(20_000).setVisible(false);

    ctx.emit({ type: 'sceneChanged', sceneId: scene.id });
  }

  override update(): void {
    const now = this.time.now;
    for (const e of this.entities) {
      if (e.isPlayer || e.defeated) continue;
      if (e.enemy) updateEnemy(this, e, this.dialogueActive ? null : this.player, now);
      else if (e.wander) updateWander(e, now);
    }
    if (this.player) updatePlayer(this.player, this.keys, this.dialogueActive || this.gameOver, now);
    for (const e of this.entities) updateBreathing(e, now);
    this.healthBars.update(this.entities);
    if (!this.player) return;
    this.hud.update(this.player);
    if (this.dialogueActive || this.gameOver) {
      this.prompt.setVisible(false);
      return;
    }
    const target = findInteractable(this.player, this.entities, ctxOf(this).project.settings.tileSize);
    if (target?.sprite) {
      this.prompt.setText(target.interact?.prompt ?? 'Talk');
      this.prompt.setPosition(target.sprite.x + (target.character?.frameWidth ?? 32) / 2 - this.prompt.width / 2, spriteTop(target) - 12);
      this.prompt.setVisible(true);
    } else {
      this.prompt.setVisible(false);
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
      case 'changeScene':
        if (!ctx.project.scenes[action.sceneId]) return;
        this.scene.stop(SCENE_KEYS.dialogue);
        this.scene.restart({ sceneId: action.sceneId, spawn: action.spawn } satisfies WorldInit);
        break;
      case 'setVariable':
        setVariable(ctx.state, action.variableId, action.op, action.value);
        break;
      case 'sequence':
        for (const a of action.actions) this.runAction(a);
        break;
    }
  }

  private showGameOver(): void {
    this.gameOver = true;
    const { width, height } = this.scale;
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setScrollFactor(0).setDepth(25_000).setAlpha(0);
    const text = this.add.text(width / 2, height / 2 + 6, 'You were defeated.\nPress the attack key to try again.', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(25_001).setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 500, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: text, alpha: 1, y: height / 2, duration: 500, delay: 250, ease: 'Quad.easeOut' });
  }

  private retry(): void {
    // Enemies already defeated stay defeated; the player respawns at the scene's own spawn.
    this.scene.restart({ sceneId: this.sceneData.id } satisfies WorldInit);
  }

  /** Called by the dialogue scene when it closes. */
  endDialogue(followUps: Action[]): void {
    this.dialogueActive = false;
    for (const a of followUps) this.runAction(a);
  }
}
