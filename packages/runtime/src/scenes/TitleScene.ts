import Phaser from 'phaser';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { hasTouch } from '../systems/input.js';
import { atmosphereAt } from '../systems/atmosphere.js';
import { keycap, TEXT, UI } from '../ui/theme.js';
import { RUNTIME_VERSION } from '../version.js';
import { AudioSystem } from '../audio/AudioSystem.js';

/**
 * The opening screen: a night skyline (or the project's own backdrop image) under the game's title in the display
 * face, a tagline, and a pulsing "press any key". Any key or tap fades to the world and launches the HUD. The pause
 * menu's "Quit to title" comes back here with a fresh game state.
 */
export class TitleScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super(SCENE_KEYS.title);
  }

  create(): void {
    const ctx = ctxOf(this);
    const { width, height } = this.scale;
    const { project } = ctx;
    const p = project.settings.presentation;
    this.started = false;

    const bgKey = p?.titleBackgroundAssetId ? KEYS.image(p.titleBackgroundAssetId) : null;
    if (bgKey && this.textures.exists(bgKey)) {
      const img = this.add.image(width / 2, height / 2, bgKey);
      const k = Math.max(width / img.width, height / img.height);
      img.setScale(k * 1.04);
      this.tweens.add({ targets: img, scale: k * 1.1, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const shade = this.add.graphics();
      shade.fillGradientStyle(0x05060c, 0x05060c, 0x05060c, 0x05060c, 0.25, 0.25, 0.8, 0.8);
      shade.fillRect(0, 0, width, height);
    } else {
      this.skyline(width, height);
    }

    // Title block, centred a little above the middle.
    const titleY = height * 0.42;
    const glow = this.add.text(width / 2, titleY, project.settings.title, TEXT.display(Math.min(96, Math.round(width / 7)), '#000000')).setOrigin(0.5).setAlpha(0.55);
    glow.setPosition(width / 2 + 5, titleY + 7);
    const title = this.add.text(width / 2, titleY, project.settings.title, { ...TEXT.display(Math.min(96, Math.round(width / 7)), UI.text), stroke: '#1a0b12', strokeThickness: 8 }).setOrigin(0.5);
    const underline = this.add.rectangle(width / 2, titleY + title.height * 0.5 + 6, 0, 4, UI.accentInt, 1).setOrigin(0.5);
    this.tweens.add({ targets: underline, width: Math.min(title.width * 0.9, width * 0.6), duration: 700, delay: 350, ease: 'Cubic.easeOut' });
    const tagline = this.add.text(width / 2, titleY + title.height * 0.5 + 34, p?.tagline ?? '', { ...TEXT.body, fontSize: '21px', color: UI.info }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: tagline, alpha: 1, duration: 600, delay: 600 });
    title.setScale(1.15).setAlpha(0);
    glow.setScale(1.15).setAlpha(0);
    this.tweens.add({ targets: [title, glow], scale: 1, duration: 520, ease: 'Back.easeOut' });
    this.tweens.add({ targets: title, alpha: 1, duration: 300 });
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 300 });

    // The prompt.
    const promptY = height * 0.78;
    const touch = hasTouch();
    const label = this.add.text(width / 2 + (touch ? 0 : 22), promptY, touch ? 'TAP TO START' : 'PRESS ANY KEY', { ...TEXT.bold, fontSize: '18px', letterSpacing: 3, color: UI.text }).setOrigin(0.5);
    const cap = touch ? null : keycap(this, width / 2 - label.width / 2 - 6, promptY, 'E', 26);
    const pulse = [label, ...(cap ? [cap] : [])];
    this.tweens.add({ targets: pulse, alpha: 0.35, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(width - 12, height - 10, `Made with Beze · runtime ${RUNTIME_VERSION}`, { ...TEXT.hint, fontSize: '13px' }).setOrigin(1, 1).setAlpha(0.7);

    this.cameras.main.fadeIn(600, 5, 6, 12);
    AudioSystem.of(this)?.playMood('title');
    this.input.keyboard!.on('keydown', () => this.start());
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.start());
  }

  /** A procedural night city: gradient sky, stars, a moon, three silhouette layers with lit windows drifting slowly. */
  private skyline(width: number, height: number): void {
    const atmo = atmosphereAt(21.5);
    const sky = this.add.graphics();
    const top = Phaser.Display.Color.IntegerToColor(atmo.sky).darken(35).color;
    sky.fillGradientStyle(top, top, atmo.sky, atmo.sky, 1, 1, 1, 1);
    sky.fillRect(0, 0, width, height);
    // horizon glow
    const glow = this.add.graphics();
    glow.fillGradientStyle(0x3a2a66, 0x3a2a66, 0xd06a4a, 0xd06a4a, 0, 0, 0.55, 0.55);
    glow.fillRect(0, height * 0.45, width, height * 0.3);

    const rand = seeded(7);
    for (let i = 0; i < 90; i++) {
      const s = this.add.circle(rand() * width, rand() * height * 0.55, rand() < 0.2 ? 1.6 : 1, 0xffffff, 0.5 + rand() * 0.5);
      this.tweens.add({ targets: s, alpha: 0.15, duration: 900 + rand() * 1800, yoyo: true, repeat: -1, delay: rand() * 2000 });
    }
    const moonX = width * 0.78; const moonY = height * 0.2;
    this.add.circle(moonX, moonY, 34, 0xfff2c8, 0.12);
    this.add.circle(moonX, moonY, 22, 0xfff6dc, 1);
    this.add.circle(moonX + 9, moonY - 5, 19, top, 1);

    const layers: Array<{ depth: number; color: number; minH: number; maxH: number; speed: number; lit: number }> = [
      { depth: 0, color: 0x1a1a3c, minH: 0.18, maxH: 0.42, speed: 4, lit: 0.05 },
      { depth: 1, color: 0x101126, minH: 0.12, maxH: 0.34, speed: 9, lit: 0.09 },
      { depth: 2, color: 0x07070f, minH: 0.06, maxH: 0.24, speed: 16, lit: 0.14 },
    ];
    for (const L of layers) {
      const key = `title:skyline:${L.depth}:${width}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        const r = seeded(11 + L.depth);
        let x = 0;
        const W = width * 2;
        while (x < W) {
          const w = 24 + Math.floor(r() * 70);
          const h = Math.floor(height * (L.minH + r() * (L.maxH - L.minH)));
          const y = height - h;
          g.fillStyle(L.color, 1);
          g.fillRect(x, y, w, h);
          if (r() < 0.35) { g.fillRect(x + w * 0.3, y - 10 - r() * 20, w * 0.4, 30); }
          if (r() < 0.2) { g.fillRect(x + w / 2 - 1, y - 26 - r() * 30, 2, 40); g.fillStyle(0xff5c7a, 1); g.fillRect(x + w / 2 - 2, y - 28 - r() * 30, 4, 4); }
          // windows
          for (let wy = y + 8; wy < height - 6; wy += 9) {
            for (let wx = x + 4; wx < x + w - 5; wx += 7) {
              if (r() < L.lit) { g.fillStyle(r() < 0.8 ? 0xffe0a0 : 0x8fd3ff, 0.9); g.fillRect(wx, wy, 3, 4); }
            }
          }
          x += w + 2 + Math.floor(r() * 6);
        }
        g.generateTexture(key, W, height);
        g.destroy();
      }
      const img = this.add.tileSprite(0, 0, width, height, key).setOrigin(0, 0);
      this.tweens.add({ targets: img, tilePositionX: width * 2, duration: (width * 2 / L.speed) * 1000, repeat: -1 });
    }
    // ground haze
    const haze = this.add.graphics();
    haze.fillGradientStyle(0x05060c, 0x05060c, 0x05060c, 0x05060c, 0, 0, 0.9, 0.9);
    haze.fillRect(0, height * 0.7, width, height * 0.3);
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = ctxOf(this);
    AudioSystem.of(this)?.sfx('title_start');
    this.cameras.main.fadeOut(420, 5, 6, 12);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.launch(SCENE_KEYS.hud);
      if (hasTouch()) this.scene.launch(SCENE_KEYS.mobile);
      this.scene.start(SCENE_KEYS.world, { sceneId: ctx.state.currentSceneId });
    });
  }
}

function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
