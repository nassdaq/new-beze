import Phaser from 'phaser';
import type { Project, TileMap } from '@beze/project-schema';
import { KEYS } from '../context.js';

export interface BuiltMap {
  map: Phaser.Tilemaps.Tilemap;
  layers: Phaser.Tilemaps.TilemapLayer[];
  collision: Phaser.Tilemaps.TilemapLayer | null;
  /** v4: what a climbing player collides with: solid cells (1) only, climbable cells (2) are open. Null when the map has none. */
  climberCollision: Phaser.Tilemaps.TilemapLayer | null;
  widthPx: number;
  heightPx: number;
}

/** Converts a project map into Phaser tilemap layers plus an invisible collision layer. */
export function buildTilemap(scene: Phaser.Scene, project: Project, data: TileMap): BuiltMap {
  const map = scene.make.tilemap({ tileWidth: data.tileWidth, tileHeight: data.tileHeight, width: data.width, height: data.height });
  const tilesets: Phaser.Tilemaps.Tileset[] = [];
  for (const ref of data.tilesets) {
    const t = project.tilesets[ref.tilesetId];
    if (!t) continue;
    const ts = map.addTilesetImage(t.name, KEYS.tileset(t.id), t.tileWidth, t.tileHeight, t.margin, t.spacing, ref.firstGid);
    if (ts) tilesets.push(ts);
  }

  const layers: Phaser.Tilemaps.TilemapLayer[] = [];
  data.layers.forEach((l, i) => {
    const layer = map.createBlankLayer(l.id, tilesets);
    if (!layer) return;
    const rows: number[][] = [];
    for (let y = 0; y < data.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < data.width; x++) {
        const gid = l.data[y * data.width + x] ?? 0;
        row.push(gid === 0 ? -1 : gid);
      }
      rows.push(row);
    }
    layer.putTilesAt(rows, 0, 0);
    layer.setVisible(l.visible);
    layer.setDepth(l.aboveEntities ? 10_000 + i : i);
    layers.push(layer);
  });

  // Collision: an invisible layer with a tile wherever the grid says solid (1) or climbable (2); climbers get a
  // second one that leaves the climbable cells open.
  let collision: Phaser.Tilemaps.TilemapLayer | null = null;
  let climberCollision: Phaser.Tilemaps.TilemapLayer | null = null;
  const first = data.tilesets[0];
  if (first && tilesets.length > 0) {
    const build = (name: string, solid: (v: number) => boolean): Phaser.Tilemaps.TilemapLayer | null => {
      const layer = map.createBlankLayer(name, tilesets);
      if (!layer) return null;
      const rows: number[][] = [];
      for (let y = 0; y < data.height; y++) {
        const row: number[] = [];
        for (let x = 0; x < data.width; x++) row.push(solid(data.collision[y * data.width + x] ?? 0) ? first.firstGid : -1);
        rows.push(row);
      }
      layer.putTilesAt(rows, 0, 0);
      layer.setCollisionByExclusion([-1]);
      layer.setVisible(false);
      return layer;
    };
    collision = build('__collision', (v) => v === 1 || v === 2);
    if (data.collision.some((v) => v === 2)) climberCollision = build('__collision_climb', (v) => v === 1);
  }

  return { map, layers, collision, climberCollision, widthPx: data.width * data.tileWidth, heightPx: data.height * data.tileHeight };
}
