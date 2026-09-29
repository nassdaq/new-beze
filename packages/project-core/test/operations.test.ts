import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Operation } from '@beze/project-schema';
import { applyOperations, validateProject, hasErrors, createProject, createNpcWithDialogue, placeEnemy, type StarterPack } from '../src/index.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();
const SCENE = 'scn_village';
const MAP = 'map_village';

function apply(ops: Operation[]) {
  const r = applyOperations(fixture, ops);
  if (!r.ok) throw new Error(JSON.stringify(r.errors, null, 2));
  return r.value;
}

describe('applyOperations', () => {
  it('fixture is valid', () => {
    expect(validateProject(fixture).filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('is atomic: a failing op leaves the document untouched', () => {
    const r = applyOperations(fixture, [
      { op: 'renameProject', name: 'changed' },
      { op: 'deleteEntity', sceneId: SCENE, entityId: 'ent_nope' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ opIndex: 1, code: 'missing' });
    expect(fixture.name).toBe('Hello, Aiko');
  });

  it('rejects batches that break integrity', () => {
    const r = applyOperations(fixture, [{ op: 'deleteCharacter', id: 'chr_villager' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === 'missingCharacter')).toBe(true);
  });

  it('rejects a second player in a scene', () => {
    const r = applyOperations(fixture, [{ op: 'setComponent', sceneId: SCENE, entityId: 'ent_aiko', component: { type: 'playerControl' } }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe('multiplePlayers');
  });

  it('rejects tiles outside every tileset', () => {
    const r = applyOperations(fixture, [{ op: 'paintTiles', mapId: MAP, layerId: 'lyr_ground', cells: [{ x: 1, y: 1, gid: 99 }] }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe('badGid');
  });

  it('paints and undoes a stroke with repeated cells', () => {
    const ops: Operation[] = [{ op: 'paintTiles', mapId: MAP, layerId: 'lyr_ground', cells: [{ x: 2, y: 2, gid: 2 }, { x: 2, y: 2, gid: 3 }, { x: 3, y: 2, gid: 2 }] }];
    const { project, inverse } = apply(ops);
    expect(project.maps[MAP]!.layers[0]!.data[2 * 20 + 2]).toBe(3);
    const back = applyOperations(project, inverse);
    expect(back.ok && back.value.project).toEqual(fixture);
  });

  it('recipe: NPC with dialogue is valid and undoable', () => {
    const { ops } = createNpcWithDialogue(fixture, { sceneId: SCENE, characterId: 'chr_villager', name: 'Bo', tileX: 5, tileY: 10 }, { name: 'Bo', speaker: 'Bo', lines: ['Hi.', 'Bye.'] });
    const { project, inverse } = apply(ops);
    expect(Object.keys(project.dialogues)).toHaveLength(2);
    const back = applyOperations(project, inverse);
    expect(back.ok && back.value.project).toEqual(fixture);
  });
});

describe('v2 operations', () => {
  it('paintRect and setCollisionRect apply and undo', () => {
    const { project, inverse } = apply([
      { op: 'paintRect', mapId: MAP, layerId: 'lyr_ground', x: 2, y: 2, width: 3, height: 2, gid: 4 },
      { op: 'setCollisionRect', mapId: MAP, x: 2, y: 2, width: 3, height: 2, solid: true },
    ]);
    expect(project.maps[MAP]!.layers[0]!.data[3 * 20 + 4]).toBe(4);
    expect(project.maps[MAP]!.collision[3 * 20 + 4]).toBe(1);
    const back = applyOperations(project, inverse);
    expect(back.ok && back.value.project).toEqual(fixture);
  });

  it('rejects rectangles that leave the map', () => {
    const r = applyOperations(fixture, [{ op: 'paintRect', mapId: MAP, layerId: 'lyr_ground', x: 18, y: 0, width: 5, height: 1, gid: 1 }]);
    expect(r.ok).toBe(false);
  });

  it('enemy recipe produces a valid enemy; enemies need health', () => {
    const { ops } = placeEnemy(fixture, { sceneId: SCENE, characterId: 'chr_villager', name: 'Blob', tileX: 4, tileY: 10 });
    const { project, inverse } = apply(ops);
    const enemy = Object.values(project.scenes[SCENE]!.entities).find((e) => e.name === 'Blob')!;
    expect(enemy.components.map((c) => c.type)).toEqual(['sprite', 'body', 'health', 'enemy']);
    expect(applyOperations(project, inverse).ok).toBe(true);
    const r = applyOperations(fixture, [{ op: 'setComponent', sceneId: SCENE, entityId: 'ent_aiko', component: { type: 'enemy', speed: 40, aggroRadius: 100, damage: 1, attackCooldownMs: 500 } }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe('enemyNoHealth');
  });
});

describe('inverse property', () => {
  const cell = fc.record({ x: fc.integer({ min: 0, max: 19 }), y: fc.integer({ min: 0, max: 14 }) });
  const opArb: fc.Arbitrary<Operation> = fc.oneof(
    fc.record({ op: fc.constant('renameProject' as const), name: fc.stringMatching(/^[a-z]{1,10}$/) }),
    fc.record({ op: fc.constant('updateSettings' as const), patch: fc.record({ defaultMoveSpeed: fc.integer({ min: 1, max: 500 }), pixelArt: fc.boolean() }) }),
    fc.record({
      op: fc.constant('paintTiles' as const), mapId: fc.constant(MAP), layerId: fc.constantFrom('lyr_ground', 'lyr_deco'),
      cells: fc.array(fc.record({ x: fc.integer({ min: 0, max: 19 }), y: fc.integer({ min: 0, max: 14 }), gid: fc.integer({ min: 0, max: 4 }) }), { minLength: 1, maxLength: 12 }),
    }),
    fc.record({ op: fc.constant('setCollision' as const), mapId: fc.constant(MAP), cells: fc.array(fc.record({ x: fc.integer({ min: 0, max: 19 }), y: fc.integer({ min: 0, max: 14 }), solid: fc.boolean() }), { minLength: 1, maxLength: 12 }) }),
    cell.map((c) => ({ op: 'placeEntity' as const, sceneId: SCENE, entityId: 'ent_aiko', x: c.x * 32, y: c.y * 32, facing: 'left' as const })),
    fc.record({ op: fc.constant('modifyEntity' as const), sceneId: fc.constant(SCENE), entityId: fc.constant('ent_hero'), patch: fc.record({ name: fc.stringMatching(/^[A-Z][a-z]{1,8}$/), facing: fc.constantFrom('up' as const, 'down' as const) }) }),
    fc.record({ op: fc.constant('setComponent' as const), sceneId: fc.constant(SCENE), entityId: fc.constant('ent_aiko'), component: fc.record({ type: fc.constant('body' as const), solid: fc.boolean() }) }),
    fc.record({ op: fc.constant('setComponent' as const), sceneId: fc.constant(SCENE), entityId: fc.constant('ent_hero'), component: fc.record({ type: fc.constant('wander' as const), radius: fc.integer({ min: 1, max: 5 }), speed: fc.integer({ min: 1, max: 50 }) }) }),
    fc.constant({ op: 'removeComponent' as const, sceneId: SCENE, entityId: 'ent_hero', componentType: 'wander' as const }),
    fc.record({ op: fc.constant('setDialogueNode' as const), dialogueId: fc.constant('dlg_aiko_intro'), node: fc.record({ id: fc.constant('nod_hello'), type: fc.constant('line' as const), text: fc.stringMatching(/^[a-z ]{1,20}$/), next: fc.constant('nod_choice') }) }),
    fc.record({ op: fc.constant('createVariable' as const), variable: fc.record({ id: fc.constant('var_tmp'), name: fc.constant('tmp'), type: fc.constant('number' as const), initial: fc.integer() }) }),
    fc.constant({ op: 'deleteVariable' as const, id: 'var_tmp' }),
    fc.constant({ op: 'deleteEntity' as const, sceneId: SCENE, entityId: 'ent_aiko' }),
    fc.constant({ op: 'deleteLayer' as const, mapId: MAP, layerId: 'lyr_deco' }),
    fc.record({ op: fc.constant('paintRect' as const), mapId: fc.constant(MAP), layerId: fc.constantFrom('lyr_ground', 'lyr_deco'), x: fc.integer({ min: 0, max: 15 }), y: fc.integer({ min: 0, max: 10 }), width: fc.integer({ min: 1, max: 5 }), height: fc.integer({ min: 1, max: 5 }), gid: fc.integer({ min: 0, max: 4 }) }),
    fc.record({ op: fc.constant('setCollisionRect' as const), mapId: fc.constant(MAP), x: fc.integer({ min: 0, max: 15 }), y: fc.integer({ min: 0, max: 10 }), width: fc.integer({ min: 1, max: 5 }), height: fc.integer({ min: 1, max: 5 }), solid: fc.boolean() }),
    fc.record({ op: fc.constant('setComponent' as const), sceneId: fc.constant(SCENE), entityId: fc.constant('ent_aiko'), component: fc.record({ type: fc.constant('health' as const), max: fc.integer({ min: 1, max: 20 }) }) }),
  );

  it('apply then inverse is the identity (when the batch applies)', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 8 }), (ops) => {
        const forward = applyOperations(fixture, ops, { skipValidation: true });
        if (!forward.ok) return true; // batches that fail at the op level are allowed to fail
        const back = applyOperations(forward.value.project, forward.value.inverse, { skipValidation: true });
        expect(back.ok).toBe(true);
        if (back.ok) expect(back.value.project).toEqual(fixture);
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe('createProject', () => {
  it('builds a valid, playable document from a starter pack', () => {
    const starter: StarterPack = {
      assets: Object.values(fixture.assets),
      tilesets: Object.values(fixture.tilesets),
      characters: Object.values(fixture.characters),
      groundGid: 1,
      playerCharacterId: 'chr_hero',
    };
    const p = createProject('Test', starter);
    expect(hasErrors(validateProject(p))).toBe(false);
    const scene = Object.values(p.scenes)[0]!;
    expect(Object.values(scene.entities)[0]!.components.map((c) => c.type)).toEqual(['sprite', 'body', 'playerControl', 'health']);
  });
});
