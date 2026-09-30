import type { Project, Scalar } from '@beze/project-schema';

/** Everything about a play session that is not a Phaser object. Serialisable. */
export interface GameState {
  variables: Record<string, Scalar>;
  currentSceneId: string;
  firedTriggers: string[];
  /** `${sceneId}:${entityId}` of enemies already defeated; they do not respawn. */
  defeated: string[];
  /** `${sceneId}:${entityId}` removed by a `removeEntity` action (a mounted horse, a picked-up item); they stay gone. */
  removed: string[];
  /** Character the player currently wears via `setPlayerCharacter`, or null for the document's own. Survives scene changes. */
  playerCharacterId: string | null;
  /** Move-speed override that came with `setPlayerCharacter`, or null for the entity's own speed. */
  playerSpeed: number | null;
  /** The entity removed while mounted (the horse), restored on dismount. */
  mountEntityKey: string | null;
}

export function initGameState(project: Project, startSceneId?: string): GameState {
  return {
    variables: Object.fromEntries(Object.values(project.variables).map((v) => [v.id, v.initial])),
    currentSceneId: startSceneId ?? project.startSceneId,
    firedTriggers: [],
    defeated: [],
    removed: [],
    playerCharacterId: null,
    playerSpeed: null,
    mountEntityKey: null,
  };
}

export function setVariable(state: GameState, variableId: string, op: 'set' | 'add', value: Scalar): void {
  if (op === 'set') {
    state.variables[variableId] = value;
    return;
  }
  const prev = state.variables[variableId];
  if (typeof prev === 'number' && typeof value === 'number') state.variables[variableId] = prev + value;
}
