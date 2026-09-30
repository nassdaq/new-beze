import type Phaser from 'phaser';
import { spriteTop, type SpawnedEntity } from '../world/spawnEntity.js';

const WIDTH = 22;
const HEIGHT = 3;
const DEPTH = 12_000;

/** Small bars above enemies that have taken damage. Hidden while full and removed on defeat. */
export class HealthBars {
  private bars = new Map<SpawnedEntity, { g: Phaser.GameObjects.Graphics; drawn: number }>();

  constructor(private scene: Phaser.Scene) {}

  update(entities: SpawnedEntity[]): void {
    for (const e of entities) {
      const h = e.health;
      const show = !!e.enemy && !!h && !!e.sprite && !e.defeated && h.current < h.max;
      const bar = this.bars.get(e);
      if (!show) {
        if (bar) { bar.g.destroy(); this.bars.delete(e); }
        continue;
      }
      const entry = bar ?? { g: this.scene.add.graphics().setDepth(DEPTH), drawn: -1 };
      if (!bar) this.bars.set(e, entry);
      if (entry.drawn !== h!.current) this.draw(entry.g, h!.current / h!.max);
      entry.drawn = h!.current;
      const sprite = e.sprite!;
      entry.g.setPosition(Math.round(sprite.x + (e.character?.frameWidth ?? 32) / 2 - WIDTH / 2), Math.round(spriteTop(e) - 6));
    }
  }

  private draw(g: Phaser.GameObjects.Graphics, ratio: number): void {
    const fill = ratio > 0.5 ? 0x5ed36a : ratio > 0.25 ? 0xf2c14e : 0xe5484d;
    g.clear();
    g.fillStyle(0x000000, 0.75);
    g.fillRect(-1, -1, WIDTH + 2, HEIGHT + 2);
    g.fillStyle(0x3a1a1a, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(fill, 1);
    g.fillRect(0, 0, Math.max(1, Math.round(WIDTH * ratio)), HEIGHT);
  }
}
