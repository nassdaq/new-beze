import type { Project, Scalar } from '@beze/project-schema';

/** Everything about a play session that is not a Phaser object. Serialisable. */
export interface GameState {
  variables: Record<string, Scalar>;
  currentSceneId: string;
  firedTriggers: string[];
  /** `${sceneId}:${entityId}` of enemies already defeated; they do not respawn. */
  defeated: string[];
}

export function initGameState(project: Project, startSceneId?: string): GameState {
  return {
    variables: Object.fromEntries(Object.values(project.variables).map((v) => [v.id, v.initial])),
    currentSceneId: startSceneId ?? project.startSceneId,
    firedTriggers: [],
    defeated: [],
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
