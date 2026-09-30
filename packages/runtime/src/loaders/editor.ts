import type { EditorToRuntime, RuntimeToEditor } from '../protocol.js';
import { mountGame, type MountedGame } from '../mount.js';
import { RUNTIME_VERSION, SUPPORTED_SCHEMA } from '../version.js';
import { SCENE_KEYS } from '../context.js';
import type { WorldScene } from '../scenes/WorldScene.js';

/** True while a menu overlay (pause, map, inventory, shop) owns input in the mounted game. */
function overlayOpen(mounted: MountedGame): boolean {
  const world = mounted.game.scene.getScene(SCENE_KEYS.world) as WorldScene | null;
  if (!world) return false;
  return world.activeOverlay !== null;
}

/**
 * Runs inside the editor's sandboxed iframe. The iframe has an opaque origin, so the only
 * channel is postMessage. Nothing here reads cookies, storage or the parent document.
 */
export function startEditorLoader(opts: { container: HTMLElement }): void {
  let mounted: MountedGame | null = null;
  const post = (msg: RuntimeToEditor) => window.parent.postMessage(msg, '*');

  window.addEventListener('message', (ev: MessageEvent<EditorToRuntime>) => {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (msg.type === 'beze:stop') {
      mounted?.unmount();
      mounted = null;
      return;
    }
    if (msg.type === 'beze:load') {
      mounted?.unmount();
      mounted = null;
      try {
        const options = msg.options ?? {};
        mounted = mountGame({
          container: opts.container,
          project: msg.project as never,
          assetUrls: msg.assetUrls,
          ...(options.startSceneId ? { startSceneId: options.startSceneId } : {}),
          debug: options.debug ?? false,
          onEvent: (e) => {
            if (e.type === 'loaded') post({ type: 'beze:loaded' });
            else if (e.type === 'error') post({ type: 'beze:error', message: e.message });
            else post({ type: 'beze:log', level: 'info', message: e.type + ('sceneId' in e ? ` ${e.sceneId}` : '') });
          },
        });
      } catch (e) {
        post({ type: 'beze:error', message: (e as Error).message });
      }
    }
  });

  window.addEventListener('error', (ev) => post({ type: 'beze:error', message: ev.message }));
  // Escape leaves Play, unless a menu (pause, map, inventory, shop) is open: then the runtime's own
  // Escape handling closes it and the next Escape exits. This listener runs before Phaser's (registered at boot).
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.repeat) return;
    if (mounted && overlayOpen(mounted)) return;
    post({ type: 'beze:exit' });
  });
  opts.container.addEventListener('pointerdown', () => window.focus());
  post({ type: 'beze:ready', runtimeVersion: RUNTIME_VERSION, supportedSchema: { ...SUPPORTED_SCHEMA } });
}
