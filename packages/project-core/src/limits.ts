import type { Project } from '@beze/project-schema';
import type { Diagnostic } from './validate.js';

/** Free-plan limits. The Python side has an identical table and a test that they agree. */
export const LIMITS = {
  documentBytes: 2 * 1024 * 1024,
  scenesPerProject: 50,
  entitiesPerScene: 200,
  mapWidth: 200,
  mapHeight: 200,
  nodesPerDialogue: 200,
  textLength: 2000,
  assetsPerProject: 200,
  assetBytesPerProject: 100 * 1024 * 1024,
} as const;

export type Limits = typeof LIMITS;

export function checkLimits(p: Project, limits: Limits = LIMITS): Diagnostic[] {
  const out: Diagnostic[] = [];
  const over = (path: string, what: string, n: number, max: number) =>
    out.push({ severity: 'error', code: 'limit', path, message: `${what}: ${n} exceeds the limit of ${max}` });

  const scenes = Object.keys(p.scenes).length;
  if (scenes > limits.scenesPerProject) over('scenes', 'scenes', scenes, limits.scenesPerProject);
  for (const [id, s] of Object.entries(p.scenes)) {
    const n = Object.keys(s.entities).length;
    if (n > limits.entitiesPerScene) over(`scenes.${id}.entities`, `entities in "${s.name}"`, n, limits.entitiesPerScene);
  }
  for (const [id, m] of Object.entries(p.maps)) {
    if (m.width > limits.mapWidth) over(`maps.${id}.width`, `map width`, m.width, limits.mapWidth);
    if (m.height > limits.mapHeight) over(`maps.${id}.height`, `map height`, m.height, limits.mapHeight);
  }
  for (const [id, d] of Object.entries(p.dialogues)) {
    const n = Object.keys(d.nodes).length;
    if (n > limits.nodesPerDialogue) over(`dialogues.${id}.nodes`, `nodes in "${d.name}"`, n, limits.nodesPerDialogue);
  }
  const assets = Object.keys(p.assets).length;
  if (assets > limits.assetsPerProject) over('assets', 'assets', assets, limits.assetsPerProject);
  return out;
}

export function documentSize(p: Project): number {
  return new TextEncoder().encode(JSON.stringify(p)).length;
}
