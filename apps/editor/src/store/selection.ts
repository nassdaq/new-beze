export type Selection =
  | { kind: 'none' }
  | { kind: 'scene'; sceneId: string }
  | { kind: 'entity'; sceneId: string; entityId: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'dialogue'; dialogueId: string }
  | { kind: 'variable'; variableId: string };

export const NONE: Selection = { kind: 'none' };

export function sameSelection(a: Selection, b: Selection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
