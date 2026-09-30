import Phaser from 'phaser';
import type { Project, TileMap } from '@beze/project-schema';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { DEPTH, TEXT, UI } from '../ui/theme.js';
import { OverlayScene, type OverlayButton } from './OverlayScene.js';

export interface MarkerEntry {
  key: string;
  x: number;
  y: number;
  label: string;
  icon: string;
  discovered: boolean;
}

const ICON: Record<string, { color: number; glyph: string }> = {
  shop: { color: 0x6fc3ff, glyph: 'S' },
  bank: { color: 0xf6c343, glyph: '$' },
  food: { color: 0xff8c69, glyph: 'F' },
  bus: { color: 0xb98cff, glyph: 'B' },
  home: { color: 0x7ee081, glyph: 'H' },
  park: { color: 0x4ec96f, glyph: 'P' },
  mission: { color: 0xffd166, glyph: '!' },
  market: { color: 0xffa94d, glyph: 'M' },
  place: { color: 0xcfe3ff, glyph: '•' },
};

/**
 * M: the current map's tile layers downscaled into one texture (built once per map), markers with icons and labels,
 * discovered ones in colour and the rest greyed with a "?", and the player as a pulsing dot. M or Esc closes.
 */
export class MapScene extends OverlayScene {
  constructor() {
    super(SCENE_KEYS.map);
  }

  create(): void {
    const { width, height } = this.scale;
    const ctx = ctxOf(this);
    const world = this.world;
    const map = world.currentMap();
    const panel = this.setupOverlay(width - 32, height - 24);
    this.title(panel, map ? map.name : 'Map');
    this.hint(panel, 'M or Esc close');

    const areaX = panel.x + 20;
    const areaY = panel.y + 58;
    const areaW = panel.width - 40;
    const areaH = panel.height - 58 - 40;
    if (!map) {
      this.add.text(panel.centerX, panel.centerY, 'No map in this scene.', TEXT.body).setOrigin(0.5).setDepth(DEPTH.content);
      return;
    }
    const tilePx = Math.max(1, Math.min(Math.floor(areaW / map.width), Math.floor(areaH / map.height)));
    const key = this.ensureMinimap(ctx.project, map, tilePx);
    const w = map.width * tilePx;
    const h = map.height * tilePx;
    const ox = Math.round(areaX + (areaW - w) / 2);
    const oy = Math.round(areaY + (areaH - h) / 2);
    const frame = this.add.graphics().setDepth(DEPTH.content);
    frame.fillStyle(0x000000, 0.6); frame.fillRoundedRect(ox - 4, oy - 4, w + 8, h + 8, 8);
    frame.lineStyle(1.5, 0xffffff, 0.2); frame.strokeRoundedRect(ox - 4, oy - 4, w + 8, h + 8, 8);
    this.add.image(ox, oy, key).setOrigin(0, 0).setDepth(DEPTH.content).setAlpha(0.92);
    const scale = tilePx / map.tileWidth;

    for (const m of world.markerEntries()) {
      const mx = ox + m.x * scale;
      const my = oy + m.y * scale;
      const icon = ICON[m.icon] ?? ICON['place']!;
      const color = m.discovered ? icon.color : 0x6a6f80;
      this.add.circle(mx, my + 2, 11, 0x000000, 0.5).setDepth(DEPTH.content);
      this.add.circle(mx, my, 10, color, 1).setStrokeStyle(2, 0xffffff, m.discovered ? 0.9 : 0.4).setDepth(DEPTH.top);
      this.add.text(mx, my, m.discovered ? icon.glyph : '?', { ...TEXT.bold, fontSize: '13px', color: '#14121c' }).setOrigin(0.5).setDepth(DEPTH.top);
      const label = this.add.text(mx, my + 13, m.discovered ? m.label : '???', { ...TEXT.small, fontStyle: '800', color: m.discovered ? UI.text : UI.muted, stroke: '#000000', strokeThickness: 4 })
        .setOrigin(0.5, 0).setDepth(DEPTH.top);
      label.x = Phaser.Math.Clamp(label.x, ox + label.width / 2, ox + w - label.width / 2);
    }

    const p = world.playerCenter();
    if (p) {
      const px = ox + p.x * scale;
      const py = oy + p.y * scale;
      const ring = this.add.circle(px, py, 10, 0xffffff, 0).setStrokeStyle(2, 0xffffff, 0.9).setDepth(DEPTH.top);
      const dot = this.add.circle(px, py, 6, 0xff4d6d, 1).setStrokeStyle(2, 0xffffff, 1).setDepth(DEPTH.top);
      this.tweens.add({ targets: dot, alpha: 0.2, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: ring, scale: 2, alpha: 0, duration: 1100, repeat: -1, ease: 'Quad.easeOut' });
      this.add.text(px, py - 14, 'YOU', { ...TEXT.label, fontSize: '12px', color: UI.text, stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(DEPTH.top);
    }
  }

  /** Draws every visible tile layer at `tilePx` per tile into a canvas texture; cached per map and scale. */
  private ensureMinimap(project: Project, map: TileMap, tilePx: number): string {
    const key = `minimap:${map.id}:${tilePx}`;
    if (this.textures.exists(key)) return key;
    const w = map.width * tilePx;
    const h = map.height * tilePx;
    const canvas = this.textures.createCanvas(key, w, h);
    if (!canvas) return key;
    const c = canvas.getContext();
    c.imageSmoothingEnabled = false;
    c.fillStyle = project.settings.backgroundColor;
    c.fillRect(0, 0, w, h);
    const sets = map.tilesets
      .map((ref) => ({ ref, tileset: project.tilesets[ref.tilesetId], image: this.textures.exists(KEYS.tileset(ref.tilesetId)) ? this.textures.get(KEYS.tileset(ref.tilesetId)).getSourceImage() : null }))
      .filter((s) => s.tileset && s.image)
      .sort((a, b) => b.ref.firstGid - a.ref.firstGid);
    for (const layer of map.layers) {
      if (!layer.visible) continue;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const gid = layer.data[y * map.width + x] ?? 0;
          if (gid === 0) continue;
          const s = sets.find((t) => gid >= t.ref.firstGid);
          if (!s || !s.tileset) continue;
          const t = s.tileset;
          const local = gid - s.ref.firstGid;
          const sx = t.margin + (local % t.columns) * (t.tileWidth + t.spacing);
          const sy = t.margin + Math.floor(local / t.columns) * (t.tileHeight + t.spacing);
          c.drawImage(s.image as CanvasImageSource, sx, sy, t.tileWidth, t.tileHeight, x * tilePx, y * tilePx, tilePx, tilePx);
        }
      }
    }
    canvas.refresh();
    return key;
  }

  protected onButton(b: OverlayButton): void {
    if (b === 'cancel' || b === 'map') this.close();
  }
}
