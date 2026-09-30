import type Phaser from 'phaser';
import type { SpawnedEntity } from '../world/spawnEntity.js';

/** Fraction of the remaining distance closed per 60 Hz frame. */
export const CAMERA_LERP = 0.12;
/** How far ahead of the player (in world px, at full speed) the camera looks in the facing direction. */
export const LOOKAHEAD_PX = 28;
export const LOOKAHEAD_LERP = 0.04;

const DIR: Record<SpawnedEntity['facing'], readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * Smooth follow without jitter, aware of the camera's zoom. Phaser's own follower floors the scroll it stores, so a
 * low lerp gets stuck below one pixel and stutters; this keeps the scroll as floats, moves them with a frame-rate
 * independent lerp, clamps the *visible* area (width / zoom) to the map, and only rounds the value handed to the
 * camera. A gentle look-ahead drifts the view toward where the player is heading. Runs on POST_UPDATE so it sees
 * the position physics just committed.
 */
export class SmoothCamera {
  private x = 0;
  private y = 0;
  private aheadX = 0;
  private aheadY = 0;

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
      return { x: t.sprite.x + w / 2 + this.aheadX, y: t.sprite.y - h / 2 + this.aheadY };
    }
    return { x: this.widthPx / 2, y: this.heightPx / 2 };
  }

  /** The visible world size: the camera's size divided by its zoom. */
  private view(): { w: number; h: number } {
    const zoom = this.camera.zoom || 1;
    return { w: this.camera.width / zoom, h: this.camera.height / zoom };
  }

  /** Top-left of the visible world area the camera should show. */
  private desired(): { x: number; y: number } {
    const f = this.focus();
    const v = this.view();
    return { x: this.clamp(f.x - v.w / 2, this.widthPx, v.w), y: this.clamp(f.y - v.h / 2, this.heightPx, v.h) };
  }

  /** Keeps the view inside the map; a map smaller than the view is centred. */
  private clamp(scroll: number, mapPx: number, viewPx: number): number {
    if (mapPx <= viewPx) return (mapPx - viewPx) / 2;
    return Math.min(Math.max(0, scroll), mapPx - viewPx);
  }

  /** Phaser zooms about the camera's centre, so the scroll that shows a visible top-left `(x, y)` is offset by the zoom. */
  private apply(): void {
    const zoom = this.camera.zoom || 1;
    const ox = (this.camera.width - this.camera.width / zoom) / 2;
    const oy = (this.camera.height - this.camera.height / zoom) / 2;
    this.camera.setScroll(Math.round(this.x) - ox, Math.round(this.y) - oy);
  }

  /** Jumps straight to the target (scene start, teleport). */
  snap(): void {
    const d = this.desired();
    this.x = d.x;
    this.y = d.y;
    this.apply();
  }

  setTarget(target: SpawnedEntity | null): void {
    this.target = target;
  }

  update(_time: number, delta: number): void {
    const t = this.target;
    const body = t?.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    const moving = !!body && (Math.abs(body.velocity.x) > 1 || Math.abs(body.velocity.y) > 1);
    const [fx, fy] = t ? DIR[t.facing] : [0, 0];
    const ka = smoothingFactor(LOOKAHEAD_LERP, delta);
    this.aheadX += ((moving ? fx * LOOKAHEAD_PX : 0) - this.aheadX) * ka;
    this.aheadY += ((moving ? fy * LOOKAHEAD_PX : 0) - this.aheadY) * ka;
    const d = this.desired();
    const k = smoothingFactor(this.lerp, delta);
    this.x += (d.x - this.x) * k;
    this.y += (d.y - this.y) * k;
    // Settle exactly so a resting camera never hovers on a half pixel.
    if (Math.abs(d.x - this.x) < 0.01) this.x = d.x;
    if (Math.abs(d.y - this.y) < 0.01) this.y = d.y;
    this.apply();
  }
}

/** The per-frame lerp `k` rescaled to `deltaMs`, so 30 Hz and 144 Hz converge at the same speed as 60 Hz. */
export function smoothingFactor(lerpPerFrame: number, deltaMs: number): number {
  const frames = Math.max(0, deltaMs) / (1000 / 60);
  return 1 - Math.pow(1 - lerpPerFrame, frames);
}
