import { useEffect, useRef, useState } from 'react';
import type { Character, Direction } from '@beze/project-schema';
import { assets } from '../services.js';
import { useProject } from '../store/editorStore.js';
import { fitScale, frameAt, frameRect, previewAnimation, type PreviewAnim } from './spriteFrames.js';

export interface SpritePreviewProps {
  characterId: string;
  /** Side of the square box in css pixels. The frame is fitted inside, centred. Default 48. */
  size?: number;
  facing?: Direction;
  /** Which animation's first frame to show at rest. Default idle. */
  anim?: PreviewAnim;
  /** Show exactly this sheet frame, ignoring `anim`. */
  frame?: number;
  /** Cycle the animation continuously. */
  animate?: boolean;
  /** Cycle the walk frames (or `anim` when it is not idle) while the pointer is over the preview. */
  hoverAnimate?: boolean;
  /** Outline the collider box over the frame. */
  showCollider?: boolean;
  className?: string;
  title?: string;
}

/**
 * One frame of a character, drawn from its sprite sheet onto a small transparent canvas with
 * nearest-neighbour scaling. Frame layout comes from the Character record, pixels from the asset store.
 */
export function SpritePreview({ characterId, size = 48, facing = 'down', anim = 'idle', frame, animate = false, hoverAnimate = false, showCollider = false, className, title }: SpritePreviewProps) {
  const project = useProject();
  const character = project?.characters[characterId];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState(false);
  const [, setLoaded] = useState(0);
  const image = character ? assets.image(character.spriteSheetAssetId) : undefined;

  // The editor waits for the starter pack before mounting, but a later-added asset may still be decoding.
  useEffect(() => {
    if (image || !character) return;
    let alive = true;
    void assets.ready().then(() => { if (alive) setLoaded((n) => n + 1); }).catch(() => undefined);
    return () => { alive = false; };
  }, [image, character]);

  const running = animate || (hoverAnimate && hovered);
  // At rest, idle shows its first frame; while running, idle cycles the walk (idle is a single frame).
  const cycle: PreviewAnim = running && anim === 'idle' ? 'walk' : anim;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !character || !image) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { frames, frameRate } = previewAnimation(character, cycle, facing);
    const draw = (f: number) => drawFrame(ctx, character, image, f, size, dpr, showCollider);

    // A fixed `frame` wins at rest; hovering or `animate` still plays the cycle, so a strike frame can swing.
    if (!running || frames.length < 2) { draw(frame ?? frames[0] ?? 0); return; }

    let raf = 0;
    let last = -1;
    const start = performance.now();
    const tick = (now: number) => {
      const f = frameAt(frames, frameRate, now - start);
      if (f !== last) { last = f; draw(f); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [character, image, size, facing, cycle, frame, running, showCollider]);

  const classes = ['sprite-preview', !character || !image ? 'sprite-preview-missing' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <span
      className={classes}
      style={{ width: size, height: size }}
      title={title ?? character?.name}
      onMouseEnter={hoverAnimate ? () => setHovered(true) : undefined}
      onMouseLeave={hoverAnimate ? () => setHovered(false) : undefined}
      aria-label={character ? `${character.name} sprite` : 'missing sprite'}
      role="img"
    >
      {character && image ? <canvas ref={canvasRef} style={{ width: size, height: size }} /> : <span className="sprite-preview-blank">?</span>}
    </span>
  );
}

function drawFrame(ctx: CanvasRenderingContext2D, character: Character, image: HTMLImageElement, frame: number, size: number, dpr: number, showCollider: boolean): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const scale = fitScale(character.frameWidth, character.frameHeight, size);
  const dw = character.frameWidth * scale;
  const dh = character.frameHeight * scale;
  const dx = Math.floor((size - dw) / 2);
  const dy = Math.floor((size - dh) / 2);
  const r = frameRect(character, frame, image.width);
  ctx.drawImage(image, r.sx, r.sy, r.w, r.h, dx, dy, dw, dh);
  if (showCollider) {
    const c = character.collider;
    ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
    ctx.lineWidth = 1;
    ctx.fillRect(dx + c.offsetX * scale, dy + c.offsetY * scale, c.width * scale, c.height * scale);
    ctx.strokeRect(dx + c.offsetX * scale + 0.5, dy + c.offsetY * scale + 0.5, c.width * scale - 1, c.height * scale - 1);
  }
}

/** A whole image asset (a portrait, say) fitted into a square box. Smoothed, since portraits are drawn large and shown small. */
export function AssetImagePreview({ assetId, size = 48, className, title }: { assetId: string; size?: number; className?: string; title?: string }) {
  const project = useProject();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setLoaded] = useState(0);
  const image = assets.image(assetId);
  const name = project?.assets[assetId]?.name;

  useEffect(() => {
    if (image) return;
    let alive = true;
    void assets.ready().then(() => { if (alive) setLoaded((n) => n + 1); }).catch(() => undefined);
    return () => { alive = false; };
  }, [image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const scale = Math.min(size / image.width, size / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }, [image, size]);

  const classes = ['sprite-preview', 'asset-preview', image ? '' : 'sprite-preview-missing', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={classes} style={{ width: size, height: size }} title={title ?? name} role="img" aria-label={name ?? assetId}>
      {image ? <canvas ref={canvasRef} style={{ width: size, height: size }} /> : <span className="sprite-preview-blank">?</span>}
    </span>
  );
}
