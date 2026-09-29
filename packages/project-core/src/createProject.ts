import type { Asset, Character, Project, Scene, TileMap, Tileset } from '@beze/project-schema';
import { SCHEMA_VERSION } from '@beze/project-schema';
import { newId } from './ids.js';
import { canonicalComponents } from './operations.js';

/** Everything a fresh project starts with. The editor ships one; tests build their own. */
export interface StarterPack {
  assets: Asset[];
  tilesets: Tileset[];
  characters: Character[];
  /** Global tile id used to fill the ground layer of the first map. */
  groundGid: number;
  /** Character used for the player entity of the first scene. */
  playerCharacterId: string;
}

export interface CreateProjectOptions {
  mapWidth?: number;
  mapHeight?: number;
  tileSize?: 16 | 32;
  now?: () => string;
}

export const GENERATOR = 'beze-editor/0.1';

export function createProject(name: string, starter: StarterPack, options: CreateProjectOptions = {}): Project {
  const tileSize = options.tileSize ?? 32;
  const width = options.mapWidth ?? 20;
  const height = options.mapHeight ?? 15;
  const now = options.now ?? (() => new Date().toISOString());
  const createdAt = now();

  const hero = starter.characters.find((c) => c.id === starter.playerCharacterId);
  if (!hero) throw new Error(`starter pack has no character "${starter.playerCharacterId}"`);

  const mapId = newId('map');
  const sceneId = newId('scn');
  const heroId = newId('ent');

  let nextGid = 1;
  const tilesetRefs = starter.tilesets.map((t) => {
    const ref = { tilesetId: t.id, firstGid: nextGid };
    nextGid += t.tileCount;
    return ref;
  });

  const cells = width * height;
  const map: TileMap = {
    id: mapId,
    name: 'Village',
    width,
    height,
    tileWidth: tileSize,
    tileHeight: tileSize,
    tilesets: tilesetRefs,
    layers: [
      { id: newId('lyr'), name: 'Ground', visible: true, aboveEntities: false, data: new Array<number>(cells).fill(starter.groundGid) },
      { id: newId('lyr'), name: 'Decoration', visible: true, aboveEntities: false, data: new Array<number>(cells).fill(0) },
    ],
    collision: new Array<0 | 1>(cells).fill(0),
  };

  // Place the hero on the centre tile with its feet aligned to the tile bottom.
  const tx = Math.floor(width / 2);
  const ty = Math.floor(height / 2);
  const scene: Scene = {
    id: sceneId,
    name: 'Village',
    mapId,
    entities: {
      [heroId]: {
        id: heroId,
        name: 'Hero',
        x: tx * tileSize,
        y: feetAlignedY(ty, tileSize, hero),
        facing: 'down',
        components: canonicalComponents([
          { type: 'sprite', characterId: hero.id },
          { type: 'body', solid: true },
          { type: 'playerControl' },
        ]),
      },
    },
    entityOrder: [heroId],
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    name,
    settings: {
      title: name,
      viewport: { width: 480, height: 270 },
      tileSize,
      pixelArt: true,
      defaultMoveSpeed: 96,
      interactKey: 'E',
      backgroundColor: '#1a1a2e',
    },
    startSceneId: sceneId,
    assets: Object.fromEntries(starter.assets.map((a) => [a.id, a])),
    tilesets: Object.fromEntries(starter.tilesets.map((t) => [t.id, t])),
    maps: { [mapId]: map },
    characters: Object.fromEntries(starter.characters.map((c) => [c.id, c])),
    scenes: { [sceneId]: scene },
    dialogues: {},
    quests: {},
    variables: {},
    meta: { createdAt, updatedAt: createdAt, generator: GENERATOR },
  };
}

/** World y for an entity whose collider bottom should sit on the bottom edge of tile row `ty`. */
export function feetAlignedY(ty: number, tileSize: number, character: Pick<Character, 'collider'>): number {
  return ty * tileSize + tileSize - (character.collider.offsetY + character.collider.height);
}
