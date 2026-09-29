import { SCHEMA_VERSION } from './project.js';

type Migration = { from: number; to: number; run: (doc: Record<string, unknown>) => Record<string, unknown> };

/** Ordered list of migrations. Each moves a document from `from` to `to`. Empty until v2 exists. */
const MIGRATIONS: Migration[] = [];

export class MigrationError extends Error {}

/**
 * Brings an untyped document up to SCHEMA_VERSION. Returns the input unchanged when it is
 * already current. Throws MigrationError for unknown or future versions.
 */
export function migrateProject(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  let doc = input as Record<string, unknown>;
  const initial = doc['schemaVersion'];
  if (typeof initial !== 'number') return doc;
  let version: number = initial;
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(`document schema ${version} is newer than supported ${SCHEMA_VERSION}`);
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) throw new MigrationError(`no migration from schema ${version}`);
    doc = step.run(doc);
    version = step.to;
    doc = { ...doc, schemaVersion: version };
  }
  return doc;
}
