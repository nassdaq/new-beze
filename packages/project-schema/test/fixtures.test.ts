import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject, parseOperations, SCHEMA_VERSION, migrateProject, MigrationError } from '../src/index.js';

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hello-aiko.project.json'), 'utf8'));

describe('golden fixtures', () => {
  it('hello-aiko parses', () => {
    const r = parseProject(fixture);
    if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
    expect(r.value.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.keys(r.value.scenes)).toEqual(['scn_village']);
  });

  it('rejects a broken document with a path', () => {
    const r = parseProject({ ...fixture, settings: { ...fixture.settings, tileSize: 24 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.path).toBe('settings.tileSize');
  });

  it('refuses documents from the future', () => {
    expect(() => migrateProject({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(MigrationError);
  });

  it('parses an operation batch', () => {
    const r = parseOperations([{ op: 'renameProject', name: 'x' }, { op: 'bogus' }]);
    expect(r.ok).toBe(false);
  });
});
