import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject, parseOperations, SCHEMA_VERSION, migrateProject, MigrationError } from '../src/index.js';

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hello-aiko.project.json'), 'utf8'));
const hacho = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hacho.project.json'), 'utf8'));

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
