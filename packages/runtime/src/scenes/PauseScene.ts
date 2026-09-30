import { ctxOf, SCENE_KEYS } from '../context.js';
import { initGameState } from '../state/GameState.js';
import { DEPTH, TEXT, UI } from '../ui/theme.js';
import { OverlayScene, type OverlayButton } from './OverlayScene.js';

const OPTIONS = ['Resume', 'Restart scene', 'Quit to title'] as const;
const ROW_H = 36;

/** Escape: dims the world and offers Resume / Restart scene / Quit to title. Arrow keys or the joystick move, E confirms. */
export class PauseScene extends OverlayScene {
  private selected = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private bar!: Phaser.GameObjects.Graphics;
  private panel!: Phaser.Geom.Rectangle;

  constructor() {
    super(SCENE_KEYS.pause);
  }

  create(): void {
    this.selected = 0;
    this.rows = [];
    this.panel = this.setupOverlay(360, 76 + OPTIONS.length * ROW_H + 40);
    this.title(this.panel, 'Paused');
    this.bar = this.add.graphics().setDepth(DEPTH.content);
    OPTIONS.forEach((label, i) => {
      const t = this.add.text(this.panel.x + 40, this.panel.y + 70 + i * ROW_H, label, { ...TEXT.body, fontSize: '20px' }).setOrigin(0, 0.5).setDepth(DEPTH.top);
      this.rows.push(t);
    });
    this.hint(this.panel, 'Up / Down choose  ·  E confirm  ·  Esc resume');
    this.highlight();
  }

  private highlight(): void {
    this.bar.clear();
    this.rows.forEach((t, i) => {
      const active = i === this.selected;
      t.setColor(active ? UI.accent : UI.text).setFontStyle(active ? '800' : '600');
      if (active) this.rowBar(this.bar, this.panel.x + 20, t.y - ROW_H / 2 + 2, this.panel.width - 40, ROW_H - 4);
    });
  }

  protected onButton(b: OverlayButton): void {
    switch (b) {
      case 'up': this.selected = (this.selected + OPTIONS.length - 1) % OPTIONS.length; this.highlight(); break;
      case 'down': this.selected = (this.selected + 1) % OPTIONS.length; this.highlight(); break;
      case 'cancel': this.close(); break;
      case 'confirm': this.choose(); break;
      default: break;
    }
  }

  private choose(): void {
    const option = OPTIONS[this.selected];
    if (option === 'Resume') { this.close(); return; }
    if (option === 'Restart scene') {
      const world = this.world;
      this.scene.stop();
      world.closeOverlay();
      world.restartScene();
      return;
    }
    // Quit to title: a fresh game state, the HUD and world stopped, the title screen back up.
    const ctx = ctxOf(this);
    Object.assign(ctx.state, initGameState(ctx.project));
    this.scene.stop(SCENE_KEYS.hud);
    this.scene.stop(SCENE_KEYS.mobile);
    this.scene.stop(SCENE_KEYS.world);
    this.scene.stop();
    this.scene.start(SCENE_KEYS.title);
  }
}
