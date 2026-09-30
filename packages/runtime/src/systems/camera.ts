import type Phaser from 'phaser';
import type { SpawnedEntity } from '../world/spawnEntity.js';

export function setupCamera(camera: Phaser.Cameras.Scene2D.Camera, target: SpawnedEntity | null, widthPx: number, heightPx: number): void {
  camera.setBounds(0, 0, widthPx, heightPx);
  camera.setRoundPixels(true);
  if (target?.sprite) {
    // The sprite's origin is at its feet; centre the view on the middle of the frame.
    const w = target.character?.frameWidth ?? 0;
    const h = target.character?.frameHeight ?? 0;
    camera.startFollow(target.sprite, true, 1, 1, -w / 2, h / 2);
  } else {
    camera.centerOn(widthPx / 2, heightPx / 2);
  }
}
