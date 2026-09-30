import Phaser from 'phaser';
import type { Direction } from '@beze/project-schema';
import { KEYS } from '../context.js';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { UI, UI_SCALE } from '../ui/theme.js';

const SPARK_TEXTURE = 'fx:spark';
const SPARK_SIZE = 4;
const DEPTH = { slash: 15_000, sparks: 15_500, numbers: 16_000, vignette: 24_000 } as const;
const FACING_ANGLE: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const SLASH_MS = 140;
const HURT_RED = 0xd0202a;

/**
 * Juice for combat: slash arcs, spark bursts, floating numbers, hit-stop, defeat bursts, camera pulses and the
 * hurt vignette. Everything is timed with the scene clock and tweens so it is frame-rate independent.
 */
export class Effects {
  private vignette: Phaser.GameObjects.Graphics;
  private hitStopUntil = 0;
  private hitStopTimer: Phaser.Time.TimerEvent | null = null;
  private zoomTween: Phaser.Tweens.Tween | null = null;
  private colorCache = new Map<string, number>();

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists(SPARK_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, SPARK_SIZE, SPARK_SIZE);
      g.generateTexture(SPARK_TEXTURE, SPARK_SIZE, SPARK_SIZE);
      g.destroy();
    }
    this.vignette = this.buildVignette();
  }

  /**
   * A tapered crescent, white core with a pale-blue edge and a soft glow, centred on (cx, cy) and swept across the
   * facing direction. It expands and fades over ~140 ms; a thinner arc trails it to suggest the motion.
   */
  slash(cx: number, cy: number, facing: Direction, tileSize: number): void {
    const base = FACING_ANGLE[facing];
    // Pivot a little ahead of the body so the arc starts at the sprite's edge and sweeps out through the hitbox.
    const px = cx + Math.cos(base) * tileSize * 0.25;
    const py = cy + Math.sin(base) * tileSize * 0.25;
    const radius = tileSize * 0.72;
    const main = this.crescentArc(px, py, radius, tileSize, Phaser.Math.DegToRad(76), 1);
    main.setRotation(base - 0.6).setScale(0.6).setAlpha(1);
    this.scene.tweens.add({ targets: main, rotation: base + 0.45, scale: 1.3, duration: SLASH_MS, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: main, alpha: 0, duration: SLASH_MS * 0.7, delay: SLASH_MS * 0.4, ease: 'Quad.easeIn', onComplete: () => main.destroy() });

    const trail = this.crescentArc(px, py, radius * 0.9, tileSize, Phaser.Math.DegToRad(58), 0.4);
    trail.setRotation(base - 0.95).setScale(0.55).setAlpha(0);
    this.scene.tweens.add({ targets: trail, alpha: 0.9, duration: 30, delay: 25 });
    this.scene.tweens.add({ targets: trail, rotation: base + 0.15, scale: 1.15, duration: SLASH_MS * 1.1, delay: 25, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: trail, alpha: 0, duration: SLASH_MS * 0.8, delay: SLASH_MS * 0.45, ease: 'Quad.easeIn', onComplete: () => trail.destroy() });
  }

  /** 8-10 tiny sparks flung out from the contact point, with a quick impact flash behind them. */
  sparks(x: number, y: number, dx: number, dy: number, tints = [0xffffff, 0xffffff, 0xbfe9ff, 0xfff1a8]): void {
    const flash = this.scene.add.graphics({ x, y }).setDepth(DEPTH.sparks - 1);
    flash.fillStyle(0xffffff, 0.95);
    flash.fillCircle(0, 0, 5);
    flash.lineStyle(2, 0xbfe9ff, 0.9);
    flash.strokeCircle(0, 0, 7);
    flash.setScale(0.5);
    this.scene.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 130, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });

    const count = 8 + Math.floor(Math.random() * 3);
    const towards = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    const emitter = this.scene.add.particles(x, y, SPARK_TEXTURE, {
      emitting: false,
      speed: { min: 90, max: 230 },
      angle: dx === 0 && dy === 0 ? { min: 0, max: 360 } : { min: towards - 75, max: towards + 75 },
      lifespan: { min: 260, max: 420 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0.5 },
      tint: tints,
      quantity: 1,
    }).setDepth(DEPTH.sparks);
    emitter.explode(count, 0, 0);
    this.scene.time.delayedCall(500, () => emitter.destroy());
  }

  /**
   * A small puff of dust kicked up behind the feet while running: a few sand-coloured motes drifting away from the
   * direction of travel and fading out, drawn just behind the runner.
   */
  dust(x: number, y: number, facing: Direction): void {
    const away = Phaser.Math.RadToDeg(FACING_ANGLE[facing]) + 180;
    const emitter = this.scene.add.particles(x, y, SPARK_TEXTURE, {
      emitting: false,
      speed: { min: 12, max: 34 },
      angle: { min: away - 40, max: away + 40 },
      lifespan: { min: 220, max: 380 },
      scale: { start: 1.1, end: 0.2 },
      alpha: { start: 0.75, end: 0 },
      gravityY: -18,
      tint: [0xe0d2b4, 0xd6c4a0, 0xf0e6d0],
      quantity: 1,
    }).setDepth(y - 1);
    emitter.explode(3 + Math.floor(Math.random() * 2), 0, 0);
    this.scene.time.delayedCall(450, () => emitter.destroy());
  }

  /** A burst of chunkier particles in the entity's own colour plus an expanding ring, for its defeat. */
  burst(e: SpawnedEntity): void {
    const sprite = e.sprite;
    if (!sprite) return;
    const color = this.sampleColor(e);
    const light = Phaser.Display.Color.IntegerToColor(color).lighten(35).color;
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    const cx = body ? body.center.x : sprite.x + sprite.displayWidth / 2;
    const cy = body ? body.center.y - 6 : sprite.y - sprite.displayHeight / 2;

    const ring = this.scene.add.graphics({ x: cx, y: cy }).setDepth(DEPTH.sparks - 1);
    ring.lineStyle(4, light, 0.95);
    ring.strokeCircle(0, 0, 8);
    ring.setScale(0.4);
    this.scene.tweens.add({ targets: ring, scale: 3.4, alpha: 0, duration: 400, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });

    const emitter = this.scene.add.particles(cx, cy, SPARK_TEXTURE, {
      emitting: false,
      speed: { min: 50, max: 160 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 500, max: 900 },
      scale: { start: 3, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 140,
      tint: [color, light, light, 0xffffff],
      quantity: 1,
    }).setDepth(DEPTH.sparks);
    emitter.explode(18, 0, 0);
    this.scene.time.delayedCall(1100, () => emitter.destroy());
  }

  /** A number that pops above the target, rises and fades. */
  damageNumber(x: number, y: number, amount: number, color = '#ffffff'): void {
    const text = this.scene.add.text(x + (Math.random() - 0.5) * 8, y, String(amount), {
      fontFamily: UI.display, fontSize: '14px', color, stroke: '#000000', strokeThickness: 3, resolution: UI_SCALE,
    }).setOrigin(0.5, 1).setDepth(DEPTH.numbers).setScale(0.5);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 110, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: text, y: y - 22, duration: 650, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: text, alpha: 0, duration: 260, delay: 390, onComplete: () => text.destroy() });
  }

  /**
   * Freezes the world for `ms`: physics steps stop and sprite animations get a zero time-scale. Tweens and timers
   * (the VFX) keep running. Arcade's `timeScale` would replay the frozen steps in one burst afterwards, so the
   * physics side is a pause rather than a scaled step.
   */
  hitStop(ms: number): void {
    const now = this.scene.time.now;
    const until = now + ms;
    if (until <= this.hitStopUntil) return;
    this.hitStopUntil = until;
    this.scene.physics.world.pause();
    this.scene.anims.globalTimeScale = 0;
    this.hitStopTimer?.remove(false);
    this.hitStopTimer = this.scene.time.delayedCall(ms, () => {
      this.hitStopTimer = null;
      this.hitStopUntil = 0;
      this.scene.physics.world.resume();
      this.scene.anims.globalTimeScale = 1;
    });
  }

  /** A quick camera zoom in and back out. */
  zoomPulse(amount = 0.06, duration = 90): void {
    const cam = this.scene.cameras.main;
    this.zoomTween?.stop();
    cam.setZoom(1);
    this.zoomTween = this.scene.tweens.add({ targets: cam, zoom: 1 + amount, duration, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => cam.setZoom(1) });
  }

  /** Red vignette over the whole viewport: full for a beat, then fades out. */
  hurtFlash(): void {
    this.vignette.setAlpha(1).setVisible(true);
    this.scene.tweens.killTweensOf(this.vignette);
    this.scene.tweens.add({ targets: this.vignette, alpha: 0, duration: 380, delay: 70, ease: 'Quad.easeOut', onComplete: () => this.vignette.setVisible(false) });
  }

  /** Called when the world scene shuts down; the game-level animation time-scale must not leak into the next scene. */
  dispose(): void {
    this.hitStopTimer?.remove(false);
    this.hitStopTimer = null;
    this.scene.anims.globalTimeScale = 1;
  }

  /**
   * A web line shot from (x0, y0) to (x1, y1): a white strand with a pale glow that extends over ~80 ms, then fades.
   * `stuck` draws the splat where it lands; a fizzled line just thins out at its far end.
   */
  webLine(x0: number, y0: number, x1: number, y1: number, stuck: boolean): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.slash);
    const state = { t: 0 };
    const draw = (t: number) => {
      const ex = x0 + (x1 - x0) * t;
      const ey = y0 + (y1 - y0) * t;
      g.clear();
      g.lineStyle(4, 0x9fd7ff, 0.28); g.lineBetween(x0, y0, ex, ey);
      g.lineStyle(2, 0xffffff, 0.95); g.lineBetween(x0, y0, ex, ey);
      // Tiny cross-strands along the line make it read as web rather than rope.
      const len = Math.hypot(ex - x0, ey - y0);
      const nx = -(ey - y0) / (len || 1); const ny = (ex - x0) / (len || 1);
      g.lineStyle(1, 0xffffff, 0.8);
      for (let d = 10; d < len; d += 10) {
        const px = x0 + ((ex - x0) * d) / len; const py = y0 + ((ey - y0) * d) / len;
        g.lineBetween(px - nx * 2, py - ny * 2, px + nx * 2, py + ny * 2);
      }
    };
    this.scene.tweens.add({
      targets: state, t: 1, duration: 80, ease: 'Quad.easeOut', onUpdate: () => draw(state.t),
      onComplete: () => {
        draw(1);
        if (stuck) this.webBurst(x1, y1);
        this.scene.tweens.add({ targets: g, alpha: 0, duration: stuck ? 260 : 140, delay: stuck ? 120 : 0, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
      },
    });
  }

  /** The splat where a web sticks: a small radial star of strands with a ring, popping and fading. */
  webBurst(x: number, y: number): void {
    const g = this.scene.add.graphics({ x, y }).setDepth(DEPTH.sparks);
    g.lineStyle(1.5, 0xffffff, 0.95);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.lineBetween(0, 0, Math.cos(a) * 7, Math.sin(a) * 7);
    }
    g.lineStyle(1, 0xcfe9ff, 0.9);
    g.strokeCircle(0, 0, 4);
    g.setScale(0.4);
    this.scene.tweens.add({ targets: g, scale: 1.2, duration: 120, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, delay: 160, onComplete: () => g.destroy() });
  }

  /** Draws a web cocoon (w × h, centred on the graphics' origin) into `g`: crossing strands with knots. */
  drawWrap(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
    g.clear();
    const hw = w / 2; const hh = h / 2;
    g.fillStyle(0xffffff, 0.16);
    g.fillEllipse(0, 0, w, h);
    g.lineStyle(3, 0xbfe0ff, 0.35);
    g.strokeEllipse(0, 0, w, h);
    g.lineStyle(1.5, 0xffffff, 0.95);
    for (let i = -2; i <= 2; i++) {
      const yy = (i / 2.6) * hh;
      g.lineBetween(-hw, yy - 3, hw, yy + 3);
      g.lineBetween(-hw, yy + 3, hw, yy - 3);
    }
    g.lineBetween(-hw * 0.7, -hh, hw * 0.7, hh);
    g.lineBetween(hw * 0.7, -hh, -hw * 0.7, hh);
    g.fillStyle(0xffffff, 1);
    for (let i = -1; i <= 1; i++) { g.fillRect(i * hw * 0.5 - 1, -hh * 0.35 - 1, 2, 2); g.fillRect(i * hw * 0.5 - 1, hh * 0.35 - 1, 2, 2); }
  }

  /** Danger sense: three arcs on each side of the head, flaring outward and fading, plus a quick white flash. */
  sense(x: number, y: number): void {
    const g = this.scene.add.graphics({ x, y }).setDepth(DEPTH.numbers);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const r = 6 + i * 4;
        g.lineStyle(2 - i * 0.4, i === 0 ? 0xffffff : 0xfff1a8, 1 - i * 0.22);
        g.beginPath();
        g.arc(side * 4, 0, r, side > 0 ? -0.9 : Math.PI - 0.9, side > 0 ? 0.9 : Math.PI + 0.9, false);
        g.strokePath();
      }
    }
    g.setScale(0.6).setAlpha(1);
    this.scene.tweens.add({ targets: g, scale: 1.15, duration: 160, ease: 'Quad.easeOut' });
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, delay: 180, onComplete: () => g.destroy() });
    const flash = this.scene.add.circle(x, y, 5, 0xffffff, 0.8).setDepth(DEPTH.numbers - 1);
    this.scene.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 200, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
  }

  private crescentArc(cx: number, cy: number, radius: number, tileSize: number, spread: number, strength: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics({ x: cx, y: cy }).setDepth(DEPTH.slash);
    const crescent = (thickness: number, color: number, alpha: number) => {
      const outer: Phaser.Types.Math.Vector2Like[] = [];
      const inner: Phaser.Types.Math.Vector2Like[] = [];
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const t = -spread + (2 * spread * i) / steps;
        // Thickest at the middle of the sweep, tapering to points at both ends.
        const w = thickness * Math.pow(Math.cos((t / spread) * (Math.PI / 2)), 0.8);
        outer.push({ x: Math.cos(t) * (radius + w / 2), y: Math.sin(t) * (radius + w / 2) });
        inner.push({ x: Math.cos(t) * (radius - w / 2), y: Math.sin(t) * (radius - w / 2) });
      }
      g.fillStyle(color, alpha * strength);
      g.fillPoints([...outer, ...inner.reverse()], true);
    };
    crescent(tileSize * 0.6, 0x6fc3ff, 0.28);
    crescent(tileSize * 0.42, 0x8fd3ff, 0.6);
    crescent(tileSize * 0.28, 0xcdefff, 0.92);
    crescent(tileSize * 0.14, 0xffffff, 1);
    return g;
  }

  private buildVignette(): Phaser.GameObjects.Graphics {
    const { width, height } = this.scene.scale;
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.vignette).setVisible(false);
    g.fillStyle(HURT_RED, 0.22);
    g.fillRect(0, 0, width, height);
    // Concentric bands, denser towards the edge, read as a soft vignette.
    const bands = 12;
    const band = 5;
    for (let i = 0; i < bands; i++) {
      const inset = i * band + band / 2;
      g.lineStyle(band, HURT_RED, 0.05 + ((bands - 1 - i) / (bands - 1)) * 0.5);
      g.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    }
    return g;
  }

  /** Average opaque colour of the character's idle frame; cached per character. */
  private sampleColor(e: SpawnedEntity): number {
    const c = e.character;
    if (!c) return 0xffffff;
    const cached = this.colorCache.get(c.id);
    if (cached !== undefined) return cached;
    let r = 0; let g = 0; let b = 0; let n = 0;
    const frame = c.animations.idle_down.frames[0] ?? 0;
    const key = KEYS.character(c.id);
    try {
      for (let iy = 1; iy < 8; iy++) {
        for (let ix = 1; ix < 8; ix++) {
          const px = this.scene.textures.getPixel(Math.floor((c.frameWidth * ix) / 8), Math.floor((c.frameHeight * iy) / 8), key, frame);
          if (px && px.alpha > 128) { r += px.red; g += px.green; b += px.blue; n++; }
        }
      }
    } catch { /* texture not readable (cross-origin, WebGL-only); fall back to white */ }
    const color = n === 0 ? 0xffffff : Phaser.Display.Color.GetColor(Math.round(r / n), Math.round(g / n), Math.round(b / n));
    this.colorCache.set(c.id, color);
    return color;
  }
}
