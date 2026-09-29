import Phaser from 'phaser';
import type { Action, Direction, Scene } from '@beze/project-schema';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { buildTilemap, type BuiltMap } from '../world/buildTilemap.js';
import { spawnEntity, type SpawnedEntity } from '../world/spawnEntity.js';
import { createMoveKeys, setFacing, updatePlayer, type MoveKeys } from '../systems/playerControl.js';
import { findInteractable } from '../systems/interaction.js';
import { setupCamera } from '../systems/camera.js';
import { setVariable } from '../state/GameState.js';

export interface WorldInit {
  sceneId: string;
  spawn?: { x: number; y: number; facing?: Direction | undefined } | undefined;
}

const INTERACT_CODES = { E: Phaser.Input.Keyboard.KeyCodes.E, SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER } as const;

/** One Phaser scene reused for every project scene. Restarted on `changeScene`. */
export class WorldScene extends Phaser.Scene {
  private sceneData!: Scene;
  private built: BuiltMap | null = null;
  private entities: SpawnedEntity[] = [];
  private player: SpawnedEntity | null = null;
  private keys!: MoveKeys;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private prompt!: Phaser.GameObjects.Text;
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
    for (const id of scene.entityOrder) {
      const entity = scene.entities[id];
      if (!entity) continue;
      const spawned = spawnEntity(this, project, entity);
      this.entities.push(spawned);
      if (spawned.isPlayer) this.player = spawned;
      else if (spawned.sprite && spawned.sprite.body?.enable) solids.push(spawned.sprite);
    }

    const spawn = this.registry.get('spawn') as WorldInit['spawn'] | null;
    if (this.player?.sprite && spawn) {
      this.player.sprite.setPosition(spawn.x, spawn.y);
      if (spawn.facing) setFacing(this.player, spawn.facing);
    }

    if (this.player?.sprite) {
      if (solids.length > 0) this.physics.add.collider(this.player.sprite, solids);
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
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.SPACE]);

    const width = this.built?.widthPx ?? project.settings.viewport.width;
    const height = this.built?.heightPx ?? project.settings.viewport.height;
    setupCamera(this.cameras.main, this.player?.sprite ?? null, width, height);

    this.prompt = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '10px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 1 } })
      .setDepth(20_000).setVisible(false);

    ctx.emit({ type: 'sceneChanged', sceneId: scene.id });
  }

  override update(): void {
    if (!this.player) return;
    updatePlayer(this.player, this.keys, this.dialogueActive);
    if (this.dialogueActive) {
      this.prompt.setVisible(false);
      return;
    }
    const target = findInteractable(this.player, this.entities, ctxOf(this).project.settings.tileSize);
    if (target?.sprite) {
      this.prompt.setText(target.interact?.prompt ?? 'Talk');
      this.prompt.setPosition(target.sprite.x + (target.character?.frameWidth ?? 32) / 2 - this.prompt.width / 2, target.sprite.y - 12);
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

  /** Called by the dialogue scene when it closes. */
  endDialogue(followUps: Action[]): void {
    this.dialogueActive = false;
    for (const a of followUps) this.runAction(a);
  }
}
