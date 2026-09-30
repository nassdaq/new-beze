import type Phaser from 'phaser';
import type { SpawnedEntity } from '../world/spawnEntity.js';

/** Hearts in the top-left corner. Only shown when the player has health. */
export class Hud {
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, y = 4) {
    this.text = scene.add.text(6, y, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ff6b81', stroke: '#000000', strokeThickness: 3 })
      .setScrollFactor(0).setDepth(30_000);
  }

  update(player: SpawnedEntity | null): void {
    const h = player?.health;
    if (!h) { this.text.setVisible(false); return; }
    this.text.setVisible(true);
    this.text.setText('\u2665'.repeat(h.current) + '\u2661'.repeat(Math.max(0, h.max - h.current)));
  }
}
