import Phaser from 'phaser';
import { SCENE_KEYS } from '../context.js';
import { inputOf, type Button } from '../systems/input.js';
import { DEPTH, TEXT, UI } from '../ui/theme.js';
import type { WorldScene } from './WorldScene.js';

/** What an overlay reacts to: the shared buttons plus confirm (E / Enter / Space) and cancel (Escape / Q). */
export type OverlayButton = Button | 'confirm' | 'cancel';

/** Presses inside this window after opening are ignored, so the key that opened the screen cannot close it. */
const OPEN_GUARD_MS = 120;

/**
 * Base for the full-screen menus (pause, map, inventory, shop). The world is paused underneath; this dims it, draws
 * a panel, and turns keyboard and on-screen presses into `onButton` calls. `close()` hands control back to the world.
 */
export abstract class OverlayScene extends Phaser.Scene {
  private openedAt = 0;
  private unsubscribe: (() => void) | null = null;

  protected get world(): WorldScene {
    return this.scene.get(SCENE_KEYS.world) as WorldScene;
  }

  /** Dim layer, a centred panel and input wiring. Call first thing in `create`. */
  protected setupOverlay(panelW: number, panelH: number): Phaser.Geom.Rectangle {
    const { width, height } = this.scale;
    this.openedAt = this.time.now;
    this.add.rectangle(0, 0, width, height, UI.dim, UI.dimAlpha).setOrigin(0, 0).setDepth(DEPTH.dim);
    const x = Math.round((width - panelW) / 2);
    const y = Math.round((height - panelH) / 2);
    const panel = this.add.rectangle(x + panelW / 2, y + panelH / 2, panelW, panelH, UI.panel, UI.panelAlpha).setStrokeStyle(2, UI.stroke, 0.9).setDepth(DEPTH.panel);
    panel.setScale(0.96).setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, scaleX: 1, scaleY: 1, duration: 140, ease: 'Quad.easeOut' });

    const K = Phaser.Input.Keyboard.KeyCodes;
    const map: Record<number, OverlayButton> = {
      [K.UP]: 'up', [K.W]: 'up', [K.DOWN]: 'down', [K.S]: 'down', [K.LEFT]: 'left', [K.A]: 'left', [K.RIGHT]: 'right', [K.D]: 'right',
      [K.E]: 'confirm', [K.ENTER]: 'confirm', [K.SPACE]: 'confirm', [K.ESC]: 'cancel', [K.Q]: 'cancel',
      [K.M]: 'map', [K.I]: 'inventory',
    };
    const kb = this.input.keyboard!;
    kb.on('keydown', (ev: KeyboardEvent) => {
      const b = map[ev.keyCode];
      if (b && !ev.repeat) this.press(b);
    });
    kb.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT, K.SPACE]);
    const virtualMap: Partial<Record<Button, OverlayButton>> = { interact: 'confirm', pause: 'cancel', attack: 'confirm' };
    this.unsubscribe = inputOf(this).onPress((b) => this.press(virtualMap[b] ?? b));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.unsubscribe?.(); this.unsubscribe = null; });
    return new Phaser.Geom.Rectangle(x, y, panelW, panelH);
  }

  private press(b: OverlayButton): void {
    if (this.time.now - this.openedAt < OPEN_GUARD_MS) return;
    this.onButton(b);
  }

  protected abstract onButton(b: OverlayButton): void;

  protected title(panel: Phaser.Geom.Rectangle, text: string): Phaser.GameObjects.Text {
    return this.add.text(panel.x + 12, panel.y + 9, text, TEXT.title).setDepth(DEPTH.content);
  }

  protected hint(panel: Phaser.Geom.Rectangle, text: string): Phaser.GameObjects.Text {
    return this.add.text(panel.centerX, panel.bottom - 9, text, TEXT.hint).setOrigin(0.5).setDepth(DEPTH.content);
  }

  /** Stops this overlay and resumes the world. */
  protected close(): void {
    this.scene.stop();
    this.world.closeOverlay();
  }
}
