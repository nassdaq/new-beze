import Phaser from 'phaser';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { hasTouch } from '../systems/input.js';
import { ensureFonts } from '../ui/fonts.js';

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
    if (ctx.quality === 'auto') ctx.quality = softwareRenderer(this.sys.game) ? 'low' : 'high';
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
    // Interface text waits for the bundled fonts. The HUD and the on-screen controls run for the whole session,
    // beside whichever world scene is current; the title screen (when enabled) launches them itself.
    void ensureFonts().then(() => {
      if (!this.scene.isActive(SCENE_KEYS.boot)) return;
      if (ctx.title) {
        this.scene.start(SCENE_KEYS.title);
        return;
      }
      this.scene.launch(SCENE_KEYS.hud);
      if (hasTouch()) this.scene.launch(SCENE_KEYS.mobile);
      this.scene.start(SCENE_KEYS.world, { sceneId: ctx.state.currentSceneId });
    });
  }
}

/** True on CPU-side GL implementations (headless test browsers, VMs), where lights and post-effects are too slow. */
function softwareRenderer(game: Phaser.Game): boolean {
  const gl = (game.renderer as { gl?: WebGLRenderingContext }).gl;
  if (!gl) return true;
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|softpipe|software|mesa offscreen/i.test(name);
  } catch {
    return false;
  }
}
