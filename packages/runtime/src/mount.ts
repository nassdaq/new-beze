import Phaser from 'phaser';
import { parseProject } from '@beze/project-schema';
import type { RuntimeOptions } from './protocol.js';
import type { RuntimeContext } from './context.js';
import { initGameState } from './state/GameState.js';
import { BootScene } from './scenes/BootScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { DialogueScene } from './scenes/DialogueScene.js';
import { HudScene } from './scenes/HudScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { MapScene } from './scenes/MapScene.js';
import { InventoryScene } from './scenes/InventoryScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { MobileControlsScene } from './scenes/MobileControlsScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { UI_SCALE } from './ui/theme.js';
import { ensureFonts } from './ui/fonts.js';
import { VirtualInput } from './systems/input.js';
import { RUNTIME_VERSION } from './version.js';

export interface MountedGame {
  unmount(): void;
  game: Phaser.Game;
}

declare global {
  interface Window {
    __beze?: { state: RuntimeContext['state']; project: RuntimeContext['project']; runtimeVersion: string; game: Phaser.Game };
    /** A host page may force the rendering quality before the runtime starts (screenshots, benchmarks). */
    __BEZE_QUALITY?: 'high' | 'low' | 'auto';
  }
}

/** Mounts a playable game for a project document. Validates the document first and throws on failure. */
export function mountGame(opts: RuntimeOptions): MountedGame {
  const parsed = parseProject(opts.project);
  if (!parsed.ok) {
    const first = parsed.issues[0];
    throw new Error(`invalid project${first ? `: ${first.path}: ${first.message}` : ''}`);
  }
  const project = parsed.value;
  if (opts.startSceneId && !project.scenes[opts.startSceneId]) throw new Error(`scene "${opts.startSceneId}" does not exist`);

  const ctx: RuntimeContext = {
    project,
    assetUrls: opts.assetUrls,
    state: initGameState(project, opts.startSceneId),
    debug: opts.debug ?? false,
    title: opts.title ?? project.settings.presentation?.titleScreen ?? true,
    quality: opts.quality ?? window.__BEZE_QUALITY ?? 'auto',
    emit: (e) => opts.onEvent?.(e),
  };
  void ensureFonts();

  // The canvas is UI_SCALE× the document's viewport: the world camera zooms by the same factor (tiles keep their
  // on-screen size) while text, panels, lights and post-effects get the extra resolution.
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.container,
    width: project.settings.viewport.width * UI_SCALE,
    height: project.settings.viewport.height * UI_SCALE,
    pixelArt: project.settings.pixelArt,
    roundPixels: true,
    backgroundColor: project.settings.backgroundColor,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { maxLights: 24, antialias: !project.settings.pixelArt },
    audio: { disableWebAudio: false },
    input: { keyboard: true, mouse: true, touch: true, activePointers: 4 },
    banner: false,
  });
  game.registry.set('ctx', ctx);
  game.registry.set('input', new VirtualInput());
  // Scene order is render order: the HUD sits over the world and the dialogue box, menus over the HUD, and the
  // on-screen controls over everything so they stay usable inside a menu.
  game.scene.add('title', TitleScene, false);
  game.scene.add('world', WorldScene, false);
  game.scene.add('dialogue', DialogueScene, false);
  game.scene.add('hud', HudScene, false);
  game.scene.add('shop', ShopScene, false);
  game.scene.add('map', MapScene, false);
  game.scene.add('inventory', InventoryScene, false);
  game.scene.add('pause', PauseScene, false);
  game.scene.add('mobile', MobileControlsScene, false);
  game.scene.add('boot', BootScene, true);

  if (ctx.debug) window.__beze = { state: ctx.state, project, runtimeVersion: RUNTIME_VERSION, game };

  return {
    game,
    unmount() {
      game.destroy(true);
      if (window.__beze?.game === game) delete window.__beze;
    },
  };
}
