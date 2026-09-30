import Phaser from 'phaser';
import { SCENE_KEYS } from '../context.js';
import { inputOf, type Button } from '../systems/input.js';
import { DEPTH, drawPanel, TEXT, UI } from '../ui/theme.js';
import type { WorldScene } from './WorldScene.js';
import { AudioSystem } from '../audio/AudioSystem.js';

/** What an overlay reacts to: the shared buttons plus confirm (E / Enter / Space) and cancel (Escape / Q). */
export type OverlayButton = Button | 'confirm' | 'cancel';

/** Presses inside this window after opening are ignored, so the key that opened the screen cannot close it. */
const OPEN_GUARD_MS = 120;

/**
 * Base for the full-screen menus (pause, map, inventory, shop). The world is paused underneath; this dims it, draws
 * a rounded panel with a title bar, and turns keyboard and on-screen presses into `onButton` calls. `close()` hands
 * control back to the world.
 */
export abstract class OverlayScene extends Phaser.Scene {
  private openedAt = 0;
  private unsubscribe: (() => void) | null = null;
  protected panelG!: Phaser.GameObjects.Graphics;

  protected get world(): WorldScene {
    return this.scene.get(SCENE_KEYS.world) as WorldScene;
  }

  /** Dim layer, a centred panel and input wiring. Call first thing in `create`. */
  protected setupOverlay(panelW: number, panelH: number): Phaser.Geom.Rectangle {
    const { width, height } = this.scale;
    this.openedAt = this.time.now;
    const audio = AudioSystem.of(this);
    audio?.sfx('ui_open');
    audio?.duck(1);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => audio?.duck(0));
    const dim = this.add.rectangle(0, 0, width, height, UI.dim, UI.dimAlpha).setOrigin(0, 0).setDepth(DEPTH.dim).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 160 });
    const x = Math.round((width - panelW) / 2);
    const y = Math.round((height - panelH) / 2);
    this.panelG = this.add.graphics().setDepth(DEPTH.panel);
    drawPanel(this.panelG, x, y, panelW, panelH, { radius: 16 });
    // title bar underline
    this.panelG.fillStyle(UI.accentInt, 0.5);
    this.panelG.fillRect(x + 20, y + 46, panelW - 40, 1.5);
    this.panelG.setScale(0.96).setAlpha(0);
    this.tweens.add({ targets: this.panelG, alpha: 1, scaleX: 1, scaleY: 1, duration: 160, ease: 'Quad.easeOut' });

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
    const audio = AudioSystem.of(this);
    if (b === 'up' || b === 'down' || b === 'left' || b === 'right') audio?.sfx('ui_move');
    else if (b === 'confirm') audio?.sfx('ui_confirm');
    else if (b === 'cancel') audio?.sfx('ui_cancel');
    this.onButton(b);
  }

  protected abstract onButton(b: OverlayButton): void;

  protected title(panel: Phaser.Geom.Rectangle, text: string): Phaser.GameObjects.Text {
    return this.add.text(panel.x + 20, panel.y + 14, text, TEXT.title).setDepth(DEPTH.content);
  }

  protected hint(panel: Phaser.Geom.Rectangle, text: string): Phaser.GameObjects.Text {
    return this.add.text(panel.centerX, panel.bottom - 16, text, TEXT.hint).setOrigin(0.5).setDepth(DEPTH.content);
  }

  /** A highlight bar behind a selected row. */
  protected rowBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(UI.accentInt, 0.12);
    g.fillRoundedRect(x, y, w, h, 8);
    g.fillStyle(UI.accentInt, 1);
    g.fillRoundedRect(x, y + 4, 3, h - 8, 1.5);
  }

  /** Stops this overlay and resumes the world. */
  protected close(): void {
    this.scene.stop();
    this.world.closeOverlay();
  }
}
