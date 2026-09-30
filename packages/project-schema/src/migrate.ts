import { SCHEMA_VERSION } from './project.js';

type Migration = { from: number; to: number; run: (doc: Record<string, unknown>) => Record<string, unknown> };

/** Ordered list of migrations. Each moves a document from `from` to `to`. */
const MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    // v2 adds combat: settings.attackKey plus the health/enemy components (additive).
    run(doc) {
      const settings = (doc['settings'] ?? {}) as Record<string, unknown>;
      const interact = settings['interactKey'];
      return { ...doc, settings: { attackKey: interact === 'SPACE' ? 'X' : 'SPACE', ...settings } };
    },
  },
  {
    from: 2,
    to: 3,
    // v3 is purely additive (economy, quests rewards/timers, property/shop/pickup/lock/mapMarker components).
    run(doc) {
      return { ...doc };
    },
  },
  {
    from: 3,
    to: 4,
    // v4 is purely additive (abilityKey, playerControl.ability/climb/senseRadius, climbable tiles, collision value 2).
    run(doc) {
      return { ...doc };
    },
  },
];

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
