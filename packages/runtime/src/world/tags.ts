import type { Project, TileMap } from '@beze/project-schema';

/**
 * Pure helpers over a map's tiles: the tag of every cell (the topmost visible layer's tile that has one), which the
 * lighting, traffic and ambience systems read to know what is a lamp, a road, a sidewalk or a vent.
 */

export interface TagIndex {
  width: number;
  height: number;
  /** Tag per cell, or '' when no layer puts a tagged tile there. */
  tags: string[];
}

export function buildTagIndex(project: Project, map: TileMap): TagIndex {
  const refs = [...map.tilesets].sort((a, b) => b.firstGid - a.firstGid);
  const tags = new Array<string>(map.width * map.height).fill('');
  for (const layer of map.layers) {
    if (!layer.visible) continue;
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i]!;
      if (gid === 0) continue;
      const ref = refs.find((r) => gid >= r.firstGid);
      const tileset = ref ? project.tilesets[ref.tilesetId] : undefined;
      if (!ref || !tileset) continue;
      const tag = tileset.tileProperties[String(gid - ref.firstGid)]?.tag;
      if (tag) tags[i] = tag;
    }
  }
  return { width: map.width, height: map.height, tags };
}

export const tagAt = (index: TagIndex, x: number, y: number): string =>
  x < 0 || y < 0 || x >= index.width || y >= index.height ? '' : index.tags[y * index.width + x] ?? '';

export const isRoad = (tag: string): boolean => tag === 'road' || tag === 'road2' || tag.startsWith('road_') || tag.startsWith('crosswalk');
export const isSidewalk = (tag: string): boolean => tag.startsWith('sidewalk') || tag === 'paving' || tag === 'path' || tag === 'path2';
export const isGrass = (tag: string): boolean => tag.startsWith('grass') || tag === 'flowers';
