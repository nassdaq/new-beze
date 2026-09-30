/** World pixels are the truth. The camera maps them to canvas pixels. */
export interface Camera {
  /** World coordinate shown at the canvas's top-left. */
  x: number;
  y: number;
  zoom: number;
}

export interface Point { x: number; y: number }

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export function worldToScreen(c: Camera, p: Point): Point {
  return { x: (p.x - c.x) * c.zoom, y: (p.y - c.y) * c.zoom };
}

export function screenToWorld(c: Camera, p: Point): Point {
  return { x: p.x / c.zoom + c.x, y: p.y / c.zoom + c.y };
}

export function worldToTile(p: Point, tileSize: number): Point {
  return { x: Math.floor(p.x / tileSize), y: Math.floor(p.y / tileSize) };
}

/** Zooms so that the world point under `anchor` (screen) stays put. */
export function zoomAt(c: Camera, anchor: Point, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor));
  const before = screenToWorld(c, anchor);
  const next = { ...c, zoom };
  const after = screenToWorld(next, anchor);
  return { x: c.x + (before.x - after.x), y: c.y + (before.y - after.y), zoom };
}

/** Camera that centres a world rectangle in a canvas at an integer zoom that fits. */
export function fitCamera(worldW: number, worldH: number, canvasW: number, canvasH: number): Camera {
  const raw = Math.min(canvasW / worldW, canvasH / worldH) * 0.9;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw >= 1 ? Math.floor(raw) : raw));
  return { x: worldW / 2 - canvasW / zoom / 2, y: worldH / 2 - canvasH / zoom / 2, zoom };
}
