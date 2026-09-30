import { UPLOAD_LIMITS } from '../assets/AssetStore.js';
import type { RGBAImage } from './sheetTools.js';

/** File types the pickers accept. Anything that is not PNG is re-encoded to PNG before storing. */
export const ACCEPT = 'image/png,image/webp,image/jpeg,image/gif,image/bmp';

export interface DecodedFile {
  file: File;
  image: RGBAImage;
}

/** Decodes a picked file into raw RGBA pixels, checking the upload limits first. */
export async function decodeFile(file: File): Promise<DecodedFile> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" is not an image`);
  if (file.size > UPLOAD_LIMITS.maxBytes) throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB`);
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`"${file.name}" could not be decoded as an image`); });
  try {
    if (bitmap.width > UPLOAD_LIMITS.maxSide || bitmap.height > UPLOAD_LIMITS.maxSide) {
      throw new Error(`"${file.name}" is ${bitmap.width}×${bitmap.height}; the limit is ${UPLOAD_LIMITS.maxSide}×${UPLOAD_LIMITS.maxSide}`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas is unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { file, image: { width: data.width, height: data.height, data: data.data } };
  } finally {
    bitmap.close();
  }
}

/** Draws raw pixels onto a fresh canvas (pixel-exact, no smoothing). */
export function imageToCanvas(img: RGBAImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, img.width);
  canvas.height = Math.max(1, img.height);
  const ctx = canvas.getContext('2d');
  if (ctx && img.width > 0 && img.height > 0) ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

/** The first image file in a drop or paste, if any. */
export function fileFromTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.files)) if (item.type.startsWith('image/')) return item;
  return null;
}

/** "villager.png" → "Villager"; "my_cool-sprite sheet.PNG" → "My cool sprite" */
export function nameFromFile(file: File, strip: RegExp = /\b(sprite|sheet|spritesheet|tileset|tiles)\b/gi): string {
  const raw = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const stripped = raw.replace(strip, '').replace(/\s+/g, ' ').trim();
  const base = stripped || raw;
  const name = base ? base[0]!.toUpperCase() + base.slice(1) : 'Imported';
  return name.slice(0, 120);
}

/** Largest preview the dialogs draw; integer zoom above 1× keeps pixel art crisp. */
export const PREVIEW_MAX = { width: 520, height: 460 };

export function previewScale(width: number, height: number): number {
  const raw = Math.min(PREVIEW_MAX.width / width, PREVIEW_MAX.height / height, 4);
  return raw >= 1 ? Math.floor(raw) : raw;
}

/**
 * Grid lines that read on any art: a dark solid line with a light dash on top. `x`/`y` are in
 * canvas css pixels; lines are snapped to pixel centres.
 */
export function strokeGrid(ctx: CanvasRenderingContext2D, xs: number[], ys: number[], w: number, h: number, color = 'rgba(125, 211, 252, 0.95)'): void {
  ctx.lineWidth = 1;
  const pass = (style: string, dash: number[]) => {
    ctx.strokeStyle = style;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (const x of xs) { const px = Math.min(w - 0.5, Math.round(x) + 0.5); ctx.moveTo(px, 0); ctx.lineTo(px, h); }
    for (const y of ys) { const py = Math.min(h - 0.5, Math.round(y) + 0.5); ctx.moveTo(0, py); ctx.lineTo(w, py); }
    ctx.stroke();
  };
  pass('rgba(0, 0, 0, 0.7)', []);
  pass(color, [3, 3]);
  ctx.setLineDash([]);
}
