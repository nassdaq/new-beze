import type { Project, Scene, TileMap } from '@beze/project-schema';
import type { EditorState } from '../../store/editorStore.js';
import type { Point } from '../camera.js';

export interface PointerInfo {
  world: Point;
  tile: Point;
  /** Whether `tile` lies inside the map. */
  inMap: boolean;
  button: number;
  shiftKey: boolean;
}

export interface ToolContext {
  store: EditorState;
  project: Project;
  scene: Scene;
  map: TileMap | null;
}

/** A tool receives pointer events in world coordinates and dispatches operations. */
export interface Tool {
  cursor: string;
  onDown?(ctx: ToolContext, p: PointerInfo): void;
  onMove?(ctx: ToolContext, p: PointerInfo, down: boolean): void;
  onUp?(ctx: ToolContext, p: PointerInfo): void;
}
