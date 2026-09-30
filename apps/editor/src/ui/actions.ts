import type { Action, Condition, GameVariable, Project } from '@beze/project-schema';

/** Action types the ActionEditor can build from scratch. Others are shown read-only. */
export const EDITABLE_ACTION_TYPES = ['startDialogue', 'changeScene', 'setVariable', 'notify', 'playAnimation', 'startQuest', 'sequence'] as const;
export type EditableActionType = (typeof EDITABLE_ACTION_TYPES)[number];

export const ACTION_TYPE_LABELS: Record<EditableActionType, string> = {
  startDialogue: 'Start dialogue',
  changeScene: 'Go to scene',
  setVariable: 'Set variable',
  notify: 'Show message',
  playAnimation: 'Play animation',
  startQuest: 'Start quest',
  sequence: 'Sequence',
};

/** Ids available for the ids an action needs: the first of each kind, or nothing. */
export interface ActionContext {
  dialogueId?: string | undefined;
  sceneId?: string | undefined;
  questId?: string | undefined;
  variable?: Pick<GameVariable, 'id' | 'type'> | undefined;
}

export function actionContextOf(project: Pick<Project, 'dialogues' | 'scenes' | 'quests' | 'variables'>): ActionContext {
  const variable = Object.values(project.variables)[0];
  return {
    dialogueId: Object.keys(project.dialogues)[0],
    sceneId: Object.keys(project.scenes)[0],
    questId: Object.keys(project.quests)[0],
    variable: variable ? { id: variable.id, type: variable.type } : undefined,
  };
}

/** A valid starting action of `type`, or null when the project lacks what it needs (no dialogue to start...). */
export function defaultAction(type: EditableActionType, ctx: ActionContext): Action | null {
  switch (type) {
    case 'startDialogue': return ctx.dialogueId ? { type, dialogueId: ctx.dialogueId } : null;
    case 'changeScene': return ctx.sceneId ? { type, sceneId: ctx.sceneId, spawn: { x: 0, y: 0 } } : null;
    case 'setVariable': return ctx.variable ? { type, variableId: ctx.variable.id, op: ctx.variable.type === 'number' ? 'add' : 'set', value: ctx.variable.type === 'number' ? 1 : ctx.variable.type === 'boolean' ? true : '' } : null;
    case 'notify': return { type, text: 'Hello!' };
    case 'playAnimation': return { type, animation: 'celebrate' };
    case 'startQuest': return ctx.questId ? { type, questId: ctx.questId } : null;
    case 'sequence': return { type, actions: [] };
  }
}

/** Why `defaultAction` would return null, for a disabled option's tooltip. */
export function actionUnavailableReason(type: EditableActionType, ctx: ActionContext): string | null {
  if (type === 'startDialogue' && !ctx.dialogueId) return 'Create a dialogue first';
  if (type === 'changeScene' && !ctx.sceneId) return 'Create a scene first';
  if (type === 'setVariable' && !ctx.variable) return 'Create a variable first';
  if (type === 'startQuest' && !ctx.questId) return 'Create a quest first';
  return null;
}

export function isEditableActionType(type: string): type is EditableActionType {
  return (EDITABLE_ACTION_TYPES as readonly string[]).includes(type);
}

/** One line describing an action, using names from the project when available. */
export function actionLabel(a: Action, project?: Pick<Project, 'dialogues' | 'scenes' | 'quests' | 'variables' | 'characters'>): string {
  switch (a.type) {
    case 'startDialogue': return `talk: ${project?.dialogues[a.dialogueId]?.name ?? a.dialogueId}`;
    case 'changeScene': return `go to ${project?.scenes[a.sceneId]?.name ?? a.sceneId}`;
    case 'setVariable': return `${project?.variables[a.variableId]?.name ?? a.variableId} ${a.op === 'add' ? '+=' : '='} ${String(a.value)}`;
    case 'notify': return `say "${a.text}"`;
    case 'playAnimation': return `play ${a.animation}`;
    case 'startQuest': return `start quest ${project?.quests[a.questId]?.name ?? a.questId}`;
    case 'completeQuestStep': return `complete step of ${project?.quests[a.questId]?.name ?? a.questId}`;
    case 'setPlayerCharacter': return `become ${project?.characters[a.characterId]?.name ?? a.characterId}`;
    case 'removeEntity': return `remove ${a.entityId}`;
    case 'sequence': return a.actions.length === 0 ? 'empty sequence' : `${a.actions.length} steps: ${a.actions.map((x) => actionLabel(x, project)).join(', ')}`;
  }
}

/** Spawn positions are stored in pixels; the editor edits them as tiles. */
export function spawnToTile(spawn: { x: number; y: number }, tileSize: number): { x: number; y: number } {
  return { x: Math.round(spawn.x / tileSize), y: Math.round(spawn.y / tileSize) };
}
export function tileToSpawn(tile: { x: number; y: number }, tileSize: number): { x: number; y: number } {
  return { x: Math.round(tile.x) * tileSize, y: Math.round(tile.y) * tileSize };
}

/** Names of every animation any character has, beyond the standard walk set: the emotes an action can play. */
export function animationNames(project: Pick<Project, 'characters'>): string[] {
  const names = new Set<string>();
  for (const c of Object.values(project.characters)) for (const name of Object.keys(c.animations)) if (!/^(idle|walk)_/.test(name)) names.add(name);
  return [...names].sort();
}

/** Replaces the element at `index` (or removes it when `next` is null). */
export function replaceAt<T>(list: readonly T[], index: number, next: T | null): T[] {
  return next === null ? list.filter((_, i) => i !== index) : list.map((x, i) => (i === index ? next : x));
}

export function defaultCondition(variable: Pick<GameVariable, 'id' | 'type'>): Condition {
  return { variableId: variable.id, op: 'eq', value: variable.type === 'number' ? 1 : variable.type === 'boolean' ? true : '' };
}
