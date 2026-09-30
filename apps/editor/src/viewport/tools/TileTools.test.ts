import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject, type Project, type TileMap } from '@beze/project-schema';
import { objectLayerId, stampOperations, tileOperations } from './TileTools.js';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../../docs/examples/hello-aiko.project.json'), 'utf8'));
const parsed = parseProject(raw);
if (!parsed.ok) throw new Error('fixture invalid');
const project: Project = parsed.value;
const map: TileMap = project.maps['map_village']!;
const tree = { tilesetId: 'tls_outdoor', index: 0 };
const stamp = project.tilesets['tls_outdoor']!.stamps![0]!;
const firstGid = map.tilesets[0]!.firstGid;
const crownGid = firstGid + stamp.tiles[0]!;
const trunkGid = firstGid + stamp.tiles[1]!;

const paints = (ops: ReturnType<typeof stampOperations>) =>
  Object.fromEntries(ops.flatMap((o) => (o.op === 'paintTiles' ? [[o.layerId, o.cells]] : [])));

describe('stampOperations', () => {
  it('keeps the fill layer intact: trunk on Decoration, crown on Canopy, collision on the trunk', () => {
    const ops = stampOperations(project, map, tree, { x: 5, y: 4 }, 'lyr_ground', true);
    expect(paints(ops)).toEqual({
      lyr_canopy: [{ x: 5, y: 4, gid: crownGid }],
      lyr_deco: [{ x: 5, y: 5, gid: trunkGid }],
    });
    expect(ops.find((o) => o.op === 'setCollision')).toEqual({ op: 'setCollision', mapId: map.id, cells: [{ x: 5, y: 5, solid: true }] });
    expect(ops.every((o) => o.op !== 'paintTiles' || o.layerId !== 'lyr_ground')).toBe(true);
  });

  it('respects an explicitly chosen object layer and can skip collision', () => {
    const ops = stampOperations(project, map, tree, { x: 5, y: 4 }, 'lyr_deco', false);
    expect(paints(ops)).toEqual({
      lyr_canopy: [{ x: 5, y: 4, gid: crownGid }],
      lyr_deco: [{ x: 5, y: 5, gid: trunkGid }],
    });
    expect(ops.some((o) => o.op === 'setCollision')).toBe(false);
  });

  it('drops the cells outside the map', () => {
    const ops = stampOperations(project, map, tree, { x: 3, y: -1 }, 'lyr_deco', true);
    expect(paints(ops)).toEqual({ lyr_deco: [{ x: 3, y: 0, gid: trunkGid }] });
  });

  it('falls back to the active layer on a map without object or canopy layers', () => {
    const flat: TileMap = { ...map, layers: [map.layers[0]!] };
    expect(objectLayerId(flat, 'lyr_ground')).toBe('lyr_ground');
    const ops = stampOperations(project, flat, tree, { x: 5, y: 4 }, 'lyr_ground', true);
    expect(paints(ops)).toEqual({ lyr_ground: [{ x: 5, y: 4, gid: crownGid }, { x: 5, y: 5, gid: trunkGid }] });
  });
});

describe('tileOperations', () => {
  it('paints on the chosen layer and marks solid tiles with auto collision', () => {
    const ops = tileOperations(project, map, 'lyr_ground', { x: 2, y: 2, gid: trunkGid }, true);
    expect(ops).toEqual([
      { op: 'paintTiles', mapId: map.id, layerId: 'lyr_ground', cells: [{ x: 2, y: 2, gid: trunkGid }] },
      { op: 'setCollision', mapId: map.id, cells: [{ x: 2, y: 2, solid: true }] },
    ]);
    expect(tileOperations(project, map, 'lyr_ground', { x: 2, y: 2, gid: firstGid }, true)).toHaveLength(1);
  });
});
