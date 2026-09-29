import { create } from 'zustand';
import type { Operation, Project } from '@beze/project-schema';
import { applyOperations, type OperationError } from '@beze/project-core';
import { NONE, type Selection } from './selection.js';

export type Tool = 'select' | 'tileBrush' | 'eraser' | 'collision' | 'placeEntity';
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
export type PlayStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface Transaction {
  label: string;
  ops: Operation[];
  inverse: Operation[];
  /** Set while a drag or stroke keeps appending to this transaction. */
  coalesceKey: string | null;
}

export interface DispatchOptions {
  /** Consecutive dispatches with the same key merge into one undo step until `endCoalesce`. */
  coalesceKey?: string;
}

export type DispatchResult = { ok: true } | { ok: false; errors: OperationError[] };

export interface EditorState {
  project: Project | null;
  saveState: SaveState;
  /** Increments on every accepted mutation; cheap change detection for canvases and autosave. */
  version: number;
  selection: Selection;
  activeSceneId: string | null;
  activeTool: Tool;
  tileBrush: { gid: number; layerId: string | null };
  collisionMode: 'solid' | 'clear';
  placeCharacterId: string | null;
  history: { undo: Transaction[]; redo: Transaction[] };
  play: { status: PlayStatus; error: string | null };

  loadProject(project: Project): void;
  closeProject(): void;
  dispatch(label: string, ops: Operation[], options?: DispatchOptions): DispatchResult;
  endCoalesce(): void;
  undo(): void;
  redo(): void;
  select(selection: Selection): void;
  setActiveScene(sceneId: string): void;
  setTool(tool: Tool): void;
  setTileBrush(patch: Partial<EditorState['tileBrush']>): void;
  setCollisionMode(mode: 'solid' | 'clear'): void;
  setPlaceCharacter(characterId: string | null): void;
  setSaveState(state: SaveState): void;
  setPlay(play: Partial<EditorState['play']>): void;
}

const MAX_HISTORY = 200;

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  saveState: 'saved',
  version: 0,
  selection: NONE,
  activeSceneId: null,
  activeTool: 'select',
  tileBrush: { gid: 1, layerId: null },
  collisionMode: 'solid',
  placeCharacterId: null,
  history: { undo: [], redo: [] },
  play: { status: 'stopped', error: null },

  loadProject(project) {
    const sceneId = project.scenes[project.startSceneId] ? project.startSceneId : Object.keys(project.scenes)[0] ?? null;
    const map = sceneId ? project.maps[project.scenes[sceneId]!.mapId ?? ''] : undefined;
    set({
      project,
      saveState: 'saved',
      version: 0,
      selection: NONE,
      activeSceneId: sceneId,
      activeTool: 'select',
      tileBrush: { gid: 1, layerId: map?.layers[0]?.id ?? null },
      placeCharacterId: Object.keys(project.characters)[0] ?? null,
      history: { undo: [], redo: [] },
      play: { status: 'stopped', error: null },
    });
  },

  closeProject() {
    set({ project: null, history: { undo: [], redo: [] }, selection: NONE, activeSceneId: null, play: { status: 'stopped', error: null } });
  },

  dispatch(label, ops, options = {}) {
    const { project, history } = get();
    if (!project || ops.length === 0) return { ok: true };
    const result = applyOperations(project, ops);
    if (!result.ok) return { ok: false, errors: result.errors };

    const key = options.coalesceKey ?? null;
    const top = history.undo[history.undo.length - 1];
    let undo: Transaction[];
    if (key && top && top.coalesceKey === key) {
      const merged: Transaction = { ...top, ops: [...top.ops, ...ops], inverse: [...result.value.inverse, ...top.inverse] };
      undo = [...history.undo.slice(0, -1), merged];
    } else {
      undo = [...history.undo, { label, ops, inverse: result.value.inverse, coalesceKey: key }].slice(-MAX_HISTORY);
    }
    set((s) => ({ project: result.value.project, version: s.version + 1, saveState: 'unsaved', history: { undo, redo: [] } }));
    return { ok: true };
  },

  endCoalesce() {
    const { history } = get();
    const top = history.undo[history.undo.length - 1];
    if (!top || top.coalesceKey === null) return;
    set({ history: { ...history, undo: [...history.undo.slice(0, -1), { ...top, coalesceKey: null }] } });
  },

  undo() {
    const { project, history } = get();
    const tx = history.undo[history.undo.length - 1];
    if (!project || !tx) return;
    const result = applyOperations(project, tx.inverse);
    if (!result.ok) return;
    set((s) => ({
      project: result.value.project,
      version: s.version + 1,
      saveState: 'unsaved',
      history: { undo: history.undo.slice(0, -1), redo: [...history.redo, { ...tx, coalesceKey: null }] },
    }));
    reconcileSelection(get, set);
  },

  redo() {
    const { project, history } = get();
    const tx = history.redo[history.redo.length - 1];
    if (!project || !tx) return;
    const result = applyOperations(project, tx.ops);
    if (!result.ok) return;
    set((s) => ({
      project: result.value.project,
      version: s.version + 1,
      saveState: 'unsaved',
      history: { undo: [...history.undo, tx], redo: history.redo.slice(0, -1) },
    }));
    reconcileSelection(get, set);
  },

  select: (selection) => set({ selection }),
  setActiveScene(sceneId) {
    const { project } = get();
    const map = project?.maps[project.scenes[sceneId]?.mapId ?? ''];
    set((s) => ({ activeSceneId: sceneId, selection: { kind: 'scene', sceneId }, tileBrush: { ...s.tileBrush, layerId: map?.layers[0]?.id ?? null } }));
  },
  setTool: (activeTool) => set({ activeTool }),
  setTileBrush: (patch) => set((s) => ({ tileBrush: { ...s.tileBrush, ...patch } })),
  setCollisionMode: (collisionMode) => set({ collisionMode }),
  setPlaceCharacter: (placeCharacterId) => set({ placeCharacterId }),
  setSaveState: (saveState) => set({ saveState }),
  setPlay: (play) => set((s) => ({ play: { ...s.play, ...play } })),
}));

/** Drops selections that point at things undo/redo removed. */
function reconcileSelection(get: () => EditorState, set: (p: Partial<EditorState>) => void) {
  const { project, selection, activeSceneId } = get();
  if (!project) return;
  if (activeSceneId && !project.scenes[activeSceneId]) set({ activeSceneId: project.startSceneId, selection: NONE });
  const gone =
    (selection.kind === 'entity' && !project.scenes[selection.sceneId]?.entities[selection.entityId]) ||
    (selection.kind === 'scene' && !project.scenes[selection.sceneId]) ||
    (selection.kind === 'dialogue' && !project.dialogues[selection.dialogueId]) ||
    (selection.kind === 'variable' && !project.variables[selection.variableId]) ||
    (selection.kind === 'character' && !project.characters[selection.characterId]);
  if (gone) set({ selection: NONE });
}

/** Convenience selectors. */
export const useProject = () => useEditor((s) => s.project);
export const useActiveScene = () => useEditor((s) => (s.project && s.activeSceneId ? s.project.scenes[s.activeSceneId] ?? null : null));
