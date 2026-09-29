import type Phaser from 'phaser';
import type { Project } from '@beze/project-schema';
import type { RuntimeEvent } from './protocol.js';
import type { GameState } from './state/GameState.js';

/** Shared across scenes through the Phaser registry under the key 'ctx'. */
export interface RuntimeContext {
  project: Project;
  assetUrls: Record<string, string>;
  state: GameState;
  debug: boolean;
  emit: (e: RuntimeEvent) => void;
}

export function ctxOf(scene: Phaser.Scene): RuntimeContext {
  return scene.registry.get('ctx') as RuntimeContext;
}

export const KEYS = {
  character: (id: string) => `chr:${id}`,
  tileset: (id: string) => `tls:${id}`,
  image: (id: string) => `ast:${id}`,
  animation: (characterId: string, name: string) => `chr:${characterId}:${name}`,
} as const;

export const SCENE_KEYS = { boot: 'boot', world: 'world', dialogue: 'dialogue' } as const;
