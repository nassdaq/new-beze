import type { Character, Direction, Entity, Project, Scene, TileLayer, TileMap, Tileset } from '@beze/project-schema';
import type { AssetStore } from '../assets/AssetStore.js';
import type { Selection } from '../store/selection.js';
import { worldToScreen, type Camera, type Point } from './camera.js';

export interface Overlay {
  selection: Selection;
  hoverTile: Point | null;
  showCollision: boolean;
  /** Ghost sprite for the place tool. */
  ghost: { characterId: string; tile: Point } | null;
}

interface LayerCache {
  layer: TileLayer;
  tilesets: TileMap['tilesets'];
  canvas: HTMLCanvasElement;
}

/**
 * Draws one scene: tile layers (cached per layer as offscreen canvases), entities sorted by
 * their feet, then grid, collision, selection and tool ghosts. Pure drawing; no state changes.
 */
export class ViewportRenderer {
  private ctx: CanvasRenderingContext2D;
  private layerCache = new Map<string, LayerCache>();

  constructor(private canvas: HTMLCanvasElement, private assets: AssetStore) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
  }

  render(project: Project, scene: Scene, camera: Camera, overlay: Overlay): void {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#15131c';
    ctx.fillRect(0, 0, cw, ch);

    const map = scene.mapId ? project.maps[scene.mapId] : undefined;
    const origin = worldToScreen(camera, { x: 0, y: 0 });
    const z = camera.zoom;

    if (map) {
      ctx.fillStyle = project.settings.backgroundColor;
      ctx.fillRect(origin.x, origin.y, map.width * map.tileWidth * z, map.height * map.tileHeight * z);
      const below = map.layers.filter((l) => !l.aboveEntities);
      const above = map.layers.filter((l) => l.aboveEntities);
      for (const layer of below) this.drawLayer(project, map, layer, origin, z);
      this.drawEntities(project, scene, camera, overlay);
      for (const layer of above) this.drawLayer(project, map, layer, origin, z);
      if (overlay.showCollision) this.drawCollision(map, origin, z);
      this.drawGrid(map, origin, z);
    } else {
      this.drawEntities(project, scene, camera, overlay);
    }

    if (overlay.hoverTile && map) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(origin.x + overlay.hoverTile.x * map.tileWidth * z + 0.5, origin.y + overlay.hoverTile.y * map.tileHeight * z + 0.5, map.tileWidth * z - 1, map.tileHeight * z - 1);
    }
  }

  private drawLayer(project: Project, map: TileMap, layer: TileLayer, origin: Point, z: number): void {
    if (!layer.visible) return;
    let cache = this.layerCache.get(layer.id);
    if (!cache || cache.layer !== layer || cache.tilesets !== map.tilesets) {
      const canvas = cache?.canvas ?? document.createElement('canvas');
      canvas.width = map.width * map.tileWidth;
      canvas.height = map.height * map.tileHeight;
      const c = canvas.getContext('2d')!;
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.imageSmoothingEnabled = false;
      for (let i = 0; i < layer.data.length; i++) {
        const gid = layer.data[i]!;
        if (gid === 0) continue;
        const src = this.tileSource(project, map, gid);
        if (!src) continue;
        const x = (i % map.width) * map.tileWidth;
        const y = Math.floor(i / map.width) * map.tileHeight;
        c.drawImage(src.image, src.sx, src.sy, src.w, src.h, x, y, map.tileWidth, map.tileHeight);
      }
      cache = { layer, tilesets: map.tilesets, canvas };
      this.layerCache.set(layer.id, cache);
    }
    this.ctx.drawImage(cache.canvas, origin.x, origin.y, cache.canvas.width * z, cache.canvas.height * z);
  }

  tileSource(project: Project, map: TileMap, gid: number): { image: HTMLImageElement; sx: number; sy: number; w: number; h: number } | null {
    let ref: { tilesetId: string; firstGid: number } | undefined;
    for (const r of map.tilesets) if (gid >= r.firstGid) ref = r;
    if (!ref) return null;
    const tileset: Tileset | undefined = project.tilesets[ref.tilesetId];
    if (!tileset) return null;
    const local = gid - ref.firstGid;
    if (local >= tileset.tileCount) return null;
    const image = this.assets.image(tileset.imageAssetId);
    if (!image) return null;
    const col = local % tileset.columns;
    const row = Math.floor(local / tileset.columns);
    return {
      image,
      sx: tileset.margin + col * (tileset.tileWidth + tileset.spacing),
      sy: tileset.margin + row * (tileset.tileHeight + tileset.spacing),
      w: tileset.tileWidth,
      h: tileset.tileHeight,
    };
  }

  private drawEntities(project: Project, scene: Scene, camera: Camera, overlay: Overlay): void {
    const z = camera.zoom;
    const items = scene.entityOrder
      .map((id) => scene.entities[id])
      .filter((e): e is Entity => !!e)
      .map((e) => ({ e, character: characterOf(project, e) }))
      .sort((a, b) => feet(a.e, a.character) - feet(b.e, b.character));

    for (const { e, character } of items) {
      const s = worldToScreen(camera, e);
      const selected = overlay.selection.kind === 'entity' && overlay.selection.entityId === e.id;
      const size = this.drawSprite(character, e.facing, s, z, 1);
      if (!character) {
        this.ctx.fillStyle = 'rgba(255, 200, 80, 0.35)';
        this.ctx.fillRect(s.x, s.y, size.w, size.h);
      }
      if (selected) {
        this.ctx.strokeStyle = '#7dd3fc';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(s.x - 1, s.y - 1, size.w + 2, size.h + 2);
      }
      if (isPlayer(e)) {
        this.ctx.fillStyle = '#7dd3fc';
        this.ctx.font = `${Math.max(9, 5 * z)}px sans-serif`;
        this.ctx.fillText('P', s.x + 2, s.y + Math.max(9, 5 * z));
      }
    }

    if (overlay.ghost) {
      const character = project.characters[overlay.ghost.characterId];
      const map = scene.mapId ? project.maps[scene.mapId] : undefined;
      if (character && map) {
        const tileSize = project.settings.tileSize;
        const world = { x: overlay.ghost.tile.x * tileSize, y: overlay.ghost.tile.y * tileSize + tileSize - (character.collider.offsetY + character.collider.height) };
        this.drawSprite(character, 'down', worldToScreen(camera, world), z, 0.5);
      }
    }
  }

  private drawSprite(character: Character | null, facing: Direction, s: Point, z: number, alpha: number): { w: number; h: number } {
    const w = (character?.frameWidth ?? 32) * z;
    const h = (character?.frameHeight ?? 32) * z;
    if (!character) return { w, h };
    const image = this.assets.image(character.spriteSheetAssetId);
    if (!image) return { w, h };
    const frame = character.animations[`idle_${facing}`].frames[0] ?? 0;
    const cols = Math.max(1, Math.floor(image.width / character.frameWidth));
    const sx = (frame % cols) * character.frameWidth;
    const sy = Math.floor(frame / cols) * character.frameHeight;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(image, sx, sy, character.frameWidth, character.frameHeight, s.x, s.y, w, h);
    this.ctx.globalAlpha = 1;
    return { w, h };
  }

  private drawCollision(map: TileMap, origin: Point, z: number): void {
    this.ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
    for (let i = 0; i < map.collision.length; i++) {
      if (map.collision[i] !== 1) continue;
      const x = (i % map.width) * map.tileWidth;
      const y = Math.floor(i / map.width) * map.tileHeight;
      this.ctx.fillRect(origin.x + x * z, origin.y + y * z, map.tileWidth * z, map.tileHeight * z);
    }
  }

  private drawGrid(map: TileMap, origin: Point, z: number): void {
    if (map.tileWidth * z < 8) return;
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= map.width; x++) {
      const sx = Math.round(origin.x + x * map.tileWidth * z) + 0.5;
      ctx.moveTo(sx, origin.y);
      ctx.lineTo(sx, origin.y + map.height * map.tileHeight * z);
    }
    for (let y = 0; y <= map.height; y++) {
      const sy = Math.round(origin.y + y * map.tileHeight * z) + 0.5;
      ctx.moveTo(origin.x, sy);
      ctx.lineTo(origin.x + map.width * map.tileWidth * z, sy);
    }
    ctx.stroke();
  }
}

export function characterOf(project: Project, e: Entity): Character | null {
  const sprite = e.components.find((c) => c.type === 'sprite');
  return sprite && sprite.type === 'sprite' ? project.characters[sprite.characterId] ?? null : null;
}

export function isPlayer(e: Entity): boolean {
  return e.components.some((c) => c.type === 'playerControl');
}

export function feet(e: Entity, character: Character | null): number {
  return e.y + (character?.frameHeight ?? 32);
}

/** Entity bounding box in world pixels (the sprite frame). */
export function entityRect(project: Project, e: Entity): { x: number; y: number; w: number; h: number } {
  const c = characterOf(project, e);
  return { x: e.x, y: e.y, w: c?.frameWidth ?? 32, h: c?.frameHeight ?? 32 };
}
