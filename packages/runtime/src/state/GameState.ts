import type { Project, Scalar } from '@beze/project-schema';

/** Progress of one active quest. `startedAt` is world time (`clock.elapsedMs`), so timers pause with the world. */
export interface ActiveQuest {
  stepIndex: number;
  startedAt: number;
}

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
  /** v3: quests in progress, keyed by quest id. */
  activeQuests: Record<string, ActiveQuest>;
  /** v3: quest ids finished at least once, in completion order. */
  completedQuests: string[];
  /** v3: `${sceneId}:${entityId}` of `once` pickups already collected. */
  picked: string[];
  /** v3: `${sceneId}:${entityId}` of map markers the player has discovered. */
  discovered: string[];
  /** v3: world time. `elapsedMs` only advances while the world scene updates (not in menus); `day` starts at 1. */
  clock: { elapsedMs: number; day: number };
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
    activeQuests: {},
    completedQuests: [],
    picked: [],
    discovered: [],
    clock: { elapsedMs: 0, day: 1 },
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

/** The variable as a number, or 0 when it is missing or not numeric. */
export function numberOf(state: GameState, variableId: string | undefined): number {
  if (!variableId) return 0;
  const v = state.variables[variableId];
  return typeof v === 'number' ? v : 0;
}
