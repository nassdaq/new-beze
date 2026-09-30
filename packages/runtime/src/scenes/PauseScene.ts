import { SCENE_KEYS } from '../context.js';
import { DEPTH, TEXT, UI } from '../ui/theme.js';
import { OverlayScene, type OverlayButton } from './OverlayScene.js';

const OPTIONS = ['Resume', 'Restart scene', 'Quit to title'] as const;

/** Escape: dims the world and offers Resume / Restart scene / Quit to title. Arrow keys or the joystick move, E confirms. */
export class PauseScene extends OverlayScene {
  private selected = 0;
  private rows: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SCENE_KEYS.pause);
  }

  create(): void {
    this.selected = 0;
    this.rows = [];
    const panel = this.setupOverlay(196, 118);
    this.title(panel, 'Paused');
    OPTIONS.forEach((label, i) => {
      const t = this.add.text(panel.x + 22, panel.y + 40 + i * 18, label, TEXT.body).setDepth(DEPTH.content);
      this.rows.push(t);
    });
    this.hint(panel, 'Up/Down choose · E confirm · Esc resume');
    this.highlight();
  }

  private highlight(): void {
    this.rows.forEach((t, i) => t.setText((i === this.selected ? '> ' : '  ') + OPTIONS[i]).setColor(i === this.selected ? UI.accent : UI.text));
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
    // Quit to title: the host page owns the title screen, so a reload is the way back to it.
    window.location.reload();
  }
}
