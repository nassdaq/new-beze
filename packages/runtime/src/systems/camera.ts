import type Phaser from 'phaser';
import type { SpawnedEntity } from '../world/spawnEntity.js';

/** Fraction of the remaining distance closed per 60 Hz frame. */
export const CAMERA_LERP = 0.12;

/**
 * Smooth follow without jitter. Phaser's own follower floors the scroll it stores, so a low lerp gets stuck below
 * one pixel and stutters; this keeps the scroll as floats, moves them with a frame-rate-independent lerp, clamps
 * them to the map, and only rounds the value handed to the camera. Sprites render on whole pixels (`roundPixels`)
 * against a whole-pixel scroll, so diagonal or fractional speeds never shimmer. No dead zone: the player stays
 * centred. Runs on POST_UPDATE so it sees the position physics just committed.
 */
export class SmoothCamera {
  private x = 0;
  private y = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private target: SpawnedEntity | null,
    private readonly widthPx: number,
    private readonly heightPx: number,
    private readonly lerp = CAMERA_LERP,
  ) {
    camera.setRoundPixels(true);
    this.snap();
    // String event names keep this module free of a runtime Phaser import (it is unit-tested in Node).
    scene.events.on('postupdate', this.update, this);
    scene.events.once('shutdown', () => scene.events.off('postupdate', this.update, this));
  }

  /** Centre of the followed sprite in world space, or the map centre without a target. */
  private focus(): { x: number; y: number } {
    const t = this.target;
    if (t?.sprite) {
      const w = t.character?.frameWidth ?? 0;
      const h = t.character?.frameHeight ?? 0;
      return { x: t.sprite.x + w / 2, y: t.sprite.y - h / 2 };
    }
    return { x: this.widthPx / 2, y: this.heightPx / 2 };
  }

  private desired(): { x: number; y: number } {
    const f = this.focus();
    const viewW = this.camera.width;
    const viewH = this.camera.height;
    return { x: this.clamp(f.x - viewW / 2, this.widthPx, viewW), y: this.clamp(f.y - viewH / 2, this.heightPx, viewH) };
  }

  /** Keeps the view inside the map; a map smaller than the view is centred. */
  private clamp(scroll: number, mapPx: number, viewPx: number): number {
    if (mapPx <= viewPx) return (mapPx - viewPx) / 2;
    return Math.min(Math.max(0, scroll), mapPx - viewPx);
  }

  /** Jumps straight to the target (scene start, teleport). */
  snap(): void {
    const d = this.desired();
    this.x = d.x;
    this.y = d.y;
    this.camera.setScroll(Math.round(this.x), Math.round(this.y));
  }

  setTarget(target: SpawnedEntity | null): void {
    this.target = target;
  }

  update(_time: number, delta: number): void {
    const d = this.desired();
    const k = smoothingFactor(this.lerp, delta);
    this.x += (d.x - this.x) * k;
    this.y += (d.y - this.y) * k;
    // Settle exactly so a resting camera never hovers on a half pixel.
    if (Math.abs(d.x - this.x) < 0.01) this.x = d.x;
    if (Math.abs(d.y - this.y) < 0.01) this.y = d.y;
    this.camera.setScroll(Math.round(this.x), Math.round(this.y));
  }
}

/** The per-frame lerp `k` rescaled to `deltaMs`, so 30 Hz and 144 Hz converge at the same speed as 60 Hz. */
export function smoothingFactor(lerpPerFrame: number, deltaMs: number): number {
  const frames = Math.max(0, deltaMs) / (1000 / 60);
  return 1 - Math.pow(1 - lerpPerFrame, frames);
}
