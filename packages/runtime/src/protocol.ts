import type { Project } from '@beze/project-schema';

/** Messages exchanged between the editor and the runtime iframe. Nothing else crosses the boundary. */
export type EditorToRuntime =
  | { type: 'beze:load'; project: unknown; assetUrls: Record<string, string>; options?: { startSceneId?: string; debug?: boolean } }
  | { type: 'beze:stop' };

export type RuntimeToEditor =
  | { type: 'beze:ready'; runtimeVersion: string; supportedSchema: { min: number; max: number } }
  | { type: 'beze:loaded' }
  /** The player pressed Escape inside the game; the host decides what that means. */
  | { type: 'beze:exit' }
  | { type: 'beze:error'; message: string; path?: string }
  | { type: 'beze:log'; level: 'info' | 'warn' | 'error'; message: string };

export type RuntimeEvent =
  | { type: 'loaded' }
  | { type: 'sceneChanged'; sceneId: string }
  | { type: 'dialogueStarted'; dialogueId: string }
  | { type: 'dialogueEnded'; dialogueId: string }
  | { type: 'error'; message: string };

export interface RuntimeOptions {
  container: HTMLElement;
  project: Project;
  assetUrls: Record<string, string>;
  startSceneId?: string;
  debug?: boolean;
  onEvent?: (e: RuntimeEvent) => void;
}
