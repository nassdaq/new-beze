import Phaser from 'phaser';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { hasTouch } from '../systems/input.js';

/** Loads every asset the project references, builds animations, then starts the world. */
export class BootScene extends Phaser.Scene {
  private queuedImages = new Set<string>();

  constructor() {
    super(SCENE_KEYS.boot);
  }

  preload(): void {
    const { project, assetUrls } = ctxOf(this);
    const url = (assetId: string): string | undefined => assetUrls[assetId];

    for (const c of Object.values(project.characters)) {
      const u = url(c.spriteSheetAssetId);
      if (u) this.load.spritesheet(KEYS.character(c.id), u, { frameWidth: c.frameWidth, frameHeight: c.frameHeight });
      if (c.portraitAssetId) this.loadImageOnce(c.portraitAssetId);
    }
    for (const t of Object.values(project.tilesets)) {
      const u = url(t.imageAssetId);
      if (u) this.load.image(KEYS.tileset(t.id), u);
    }
    for (const d of Object.values(project.dialogues)) {
      for (const n of Object.values(d.nodes)) if (n.type === 'line' && n.portraitAssetId) this.loadImageOnce(n.portraitAssetId);
    }
    for (const s of Object.values(project.scenes)) if (s.backgroundAssetId) this.loadImageOnce(s.backgroundAssetId);

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      ctxOf(this).emit({ type: 'error', message: `failed to load asset for ${file.key}` });
    });
  }

  private loadImageOnce(assetId: string): void {
    const key = KEYS.image(assetId);
    const u = ctxOf(this).assetUrls[assetId];
    if (!u || this.textures.exists(key) || this.queuedImages.has(key)) return;
    this.queuedImages.add(key);
    this.load.image(key, u);
  }

  create(): void {
    const ctx = ctxOf(this);
    for (const c of Object.values(ctx.project.characters)) {
      for (const [name, def] of Object.entries(c.animations)) {
        if (!def) continue;
        this.anims.create({
          key: KEYS.animation(c.id, name),
          frames: this.anims.generateFrameNumbers(KEYS.character(c.id), { frames: def.frames }),
          frameRate: def.frameRate,
          repeat: def.loop ? -1 : 0,
        });
      }
    }
    ctx.emit({ type: 'loaded' });
    // The HUD and the on-screen controls run for the whole session, beside whichever world scene is current.
    this.scene.launch(SCENE_KEYS.hud);
    if (hasTouch()) this.scene.launch(SCENE_KEYS.mobile);
    this.scene.start(SCENE_KEYS.world, { sceneId: ctx.state.currentSceneId });
  }
}
