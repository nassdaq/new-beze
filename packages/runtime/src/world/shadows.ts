import type Phaser from 'phaser';
import type { TileMap } from '@beze/project-schema';
import type { TagIndex } from './tags.js';

/**
 * Soft drop shadows cast by tall things (building walls and roofs, climbable cells) onto the walkable ground below
 * and to their right, drawn once per map into a Graphics object that sits above the ground layers and below the
 * entities. Gives the flat tiles depth without touching the art.
 */
export function drawBuildingShadows(g: Phaser.GameObjects.Graphics, map: TileMap, index: TagIndex): void {
  const T = map.tileWidth;
  const tall = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    const v = map.collision[y * map.width + x];
    const tag = index.tags[y * map.width + x] ?? '';
    return v === 2 || (v === 1 && /^(wall|roof|tower|board|kiosk|shelter|stall|fountain|vault|counter|shelf)/.test(tag));
  };
  const open = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < map.width && y < map.height && map.collision[y * map.width + x] === 0;
  const bands = 6;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!tall(x, y)) continue;
      // Below: a gradient strip fading downward over 60% of a tile.
      if (open(x, y + 1)) {
        for (let i = 0; i < bands; i++) {
          g.fillStyle(0x0a0a18, 0.30 * (1 - i / bands));
          g.fillRect(x * T, (y + 1) * T + (i * T * 0.6) / bands, T, (T * 0.6) / bands + 0.5);
        }
      }
      // Right: a thinner strip, the light coming from the upper left.
      if (open(x + 1, y)) {
        for (let i = 0; i < bands; i++) {
          g.fillStyle(0x0a0a18, 0.18 * (1 - i / bands));
          g.fillRect((x + 1) * T + (i * T * 0.35) / bands, y * T, (T * 0.35) / bands + 0.5, T);
        }
      }
      // The corner below-right, so the two strips meet without a notch.
      if (open(x + 1, y + 1) && open(x, y + 1) && open(x + 1, y)) {
        g.fillStyle(0x0a0a18, 0.12);
        g.fillRect((x + 1) * T, (y + 1) * T, T * 0.25, T * 0.25);
      }
    }
  }
}
