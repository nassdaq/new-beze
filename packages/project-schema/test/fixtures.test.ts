import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject, parseOperations, SCHEMA_VERSION, migrateProject, MigrationError } from '../src/index.js';

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hello-aiko.project.json'), 'utf8'));
const hacho = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hacho.project.json'), 'utf8'));
const webslinger = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/webslinger.project.json'), 'utf8'));

describe('golden fixtures', () => {
  it('hello-aiko parses', () => {
    const r = parseProject(fixture);
    if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
    expect(r.value.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.keys(r.value.scenes)).toEqual(['scn_village']);
  });

  it('hacho parses (v3: economy, quests, city components)', () => {
    const r = parseProject(hacho);
    if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
    expect(r.value.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.value.settings.economy?.currencyPrefix).toBe('TSh ');
    expect(Object.keys(r.value.scenes)).toEqual(['scn_town', 'scn_bank', 'scn_restaurant']);
    expect(Object.keys(r.value.quests).length).toBeGreaterThanOrEqual(6);
  });

  it('webslinger parses (v4: ability key, web ability, climbable collision)', () => {
    const r = parseProject(webslinger);
    if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
    expect(r.value.settings.abilityKey).toBe('X');
    expect(r.value.maps['map_downtown']?.collision).toContain(2);
    const player = Object.values(r.value.scenes['scn_downtown']!.entities).find((e) => e.components.some((c) => c.type === 'playerControl'))!;
    expect(player.components.find((c) => c.type === 'playerControl')).toMatchObject({ ability: { type: 'web' }, climb: true });
  });

  it('migrates a v3 document to v4 unchanged', () => {
    const r = parseProject({ ...hacho, schemaVersion: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects a collision value other than 0, 1 or 2', () => {
    const map = structuredClone(fixture.maps[Object.keys(fixture.maps)[0]!]);
    map.collision[0] = 3;
    const r = parseProject({ ...fixture, maps: { [map.id]: map } });
    expect(r.ok).toBe(false);
  });

  it('rejects a broken document with a path', () => {
    const r = parseProject({ ...fixture, settings: { ...fixture.settings, tileSize: 24 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.path).toBe('settings.tileSize');
  });

  it('migrates a v1 document to v2 by adding attackKey', () => {
    const v1 = { ...fixture, schemaVersion: 1, settings: { ...fixture.settings } };
    delete (v1.settings as Record<string, unknown>)['attackKey'];
    const r = parseProject(v1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings.attackKey).toBe('SPACE');
    const v1space = { ...v1, settings: { ...v1.settings, interactKey: 'SPACE' } };
    const r2 = parseProject(v1space);
    if (r2.ok) expect(r2.value.settings.attackKey).toBe('X');
  });

  it('refuses documents from the future', () => {
    expect(() => migrateProject({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(MigrationError);
  });

  it('parses an operation batch', () => {
    const r = parseOperations([{ op: 'renameProject', name: 'x' }, { op: 'bogus' }]);
    expect(r.ok).toBe(false);
  });
});
