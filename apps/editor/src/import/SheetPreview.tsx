import { useEffect, useRef } from 'react';
import { fitScale, frameAt } from '../ui/spriteFrames.js';

export interface SheetPreviewProps {
  /** The (already cut) sheet to sample frames from. */
  sheet: HTMLCanvasElement | null;
  frameWidth: number;
  frameHeight: number;
  frames: number[];
  frameRate: number;
  size?: number;
  animate?: boolean;
  collider?: { width: number; height: number; offsetX: number; offsetY: number } | undefined;
  label?: string;
}

/**
 * Like SpritePreview, but for a sheet that is not in the project yet: the import dialog shows
 * what a character will look like before anything is stored.
 */
export function SheetPreview({ sheet, frameWidth, frameHeight, frames, frameRate, size = 64, animate = true, collider, label }: SheetPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sheet || frameWidth < 1 || frameHeight < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const columns = Math.max(1, Math.floor(sheet.width / frameWidth));
    const scale = fitScale(frameWidth, frameHeight, size);
    const dw = frameWidth * scale, dh = frameHeight * scale;
    const dx = Math.floor((size - dw) / 2), dy = Math.floor((size - dh) / 2);
    const draw = (frame: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      const sx = (frame % columns) * frameWidth;
      const sy = Math.floor(frame / columns) * frameHeight;
      ctx.drawImage(sheet, sx, sy, frameWidth, frameHeight, dx, dy, dw, dh);
      if (collider) {
        ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
        ctx.lineWidth = 1;
        ctx.fillRect(dx + collider.offsetX * scale, dy + collider.offsetY * scale, collider.width * scale, collider.height * scale);
        ctx.strokeRect(dx + collider.offsetX * scale + 0.5, dy + collider.offsetY * scale + 0.5, collider.width * scale - 1, collider.height * scale - 1);
      }
    };
    if (!animate || frames.length < 2) { draw(frames[0] ?? 0); return; }
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
  }, [sheet, frameWidth, frameHeight, frames, frameRate, size, animate, collider]);

  return (
    <figure className="frame-cell import-frame">
      <span className={`sprite-preview${sheet ? '' : ' sprite-preview-missing'}`} style={{ width: size, height: size }} role="img" aria-label={label ?? 'frame preview'}>
        {sheet ? <canvas ref={canvasRef} style={{ width: size, height: size }} /> : <span className="sprite-preview-blank">?</span>}
      </span>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
