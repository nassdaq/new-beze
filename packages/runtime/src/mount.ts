import Phaser from 'phaser';
import { parseProject } from '@beze/project-schema';
import type { RuntimeOptions } from './protocol.js';
import type { RuntimeContext } from './context.js';
import { initGameState } from './state/GameState.js';
import { BootScene } from './scenes/BootScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { DialogueScene } from './scenes/DialogueScene.js';
import { RUNTIME_VERSION } from './version.js';

export interface MountedGame {
  unmount(): void;
  game: Phaser.Game;
}

declare global {
  interface Window {
    __beze?: { state: RuntimeContext['state']; project: RuntimeContext['project']; runtimeVersion: string; game: Phaser.Game };
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
    emit: (e) => opts.onEvent?.(e),
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.container,
    width: project.settings.viewport.width,
    height: project.settings.viewport.height,
    pixelArt: project.settings.pixelArt,
    roundPixels: true,
    backgroundColor: project.settings.backgroundColor,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
    input: { keyboard: true, mouse: true, touch: false },
    banner: false,
  });
  game.registry.set('ctx', ctx);
  game.scene.add('world', WorldScene, false);
  game.scene.add('dialogue', DialogueScene, false);
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
