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
  /** Whether the title screen opens the game (also where "Quit to title" goes). */
  title: boolean;
  /** Effects on or off; `auto` is resolved to one of the two once the renderer exists (BootScene). */
  quality: 'high' | 'low' | 'auto';
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

export const SCENE_KEYS = {
  boot: 'boot', title: 'title', world: 'world', dialogue: 'dialogue',
  /** v3: HUD (always running), overlays (one at a time, they pause the world) and the on-screen controls. */
  hud: 'hud', shop: 'shop', pause: 'pause', map: 'map', inventory: 'inventory', mobile: 'mobile',
} as const;
/** Overlay scenes: only one runs at a time and the world is paused underneath. */
export type OverlayKey = typeof SCENE_KEYS.shop | typeof SCENE_KEYS.pause | typeof SCENE_KEYS.map | typeof SCENE_KEYS.inventory;
