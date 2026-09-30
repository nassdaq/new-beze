/** Mirror of packages/runtime/src/protocol.ts. Kept as a copy so the editor never imports Phaser. */
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
