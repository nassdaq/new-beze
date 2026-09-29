import type Phaser from 'phaser';

export function setupCamera(camera: Phaser.Cameras.Scene2D.Camera, target: Phaser.GameObjects.GameObject | null, widthPx: number, heightPx: number): void {
  camera.setBounds(0, 0, widthPx, heightPx);
  camera.setRoundPixels(true);
  if (target) camera.startFollow(target, true, 1, 1);
  else camera.centerOn(widthPx / 2, heightPx / 2);
}
