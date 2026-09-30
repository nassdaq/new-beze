import Phaser from 'phaser';

/**
 * Code-drawn top-down cars for the traffic system: one texture per colour variant, drawn facing right (the
 * ambient system flips or rotates it per lane). 34×18 px on 32 px tiles: a little longer than a tile, one lane wide.
 */
export const CAR_W = 34;
export const CAR_H = 18;

const VARIANTS = [
  { body: 0xd8433a, dark: 0x8f2521, light: 0xf07a6e },
  { body: 0x2f6fd8, dark: 0x1b3f80, light: 0x6fa0f0 },
  { body: 0xf2f2ee, dark: 0xa8a8a2, light: 0xffffff },
  { body: 0x2b2b30, dark: 0x111114, light: 0x55555c },
  { body: 0xf5c23a, dark: 0xa87a12, light: 0xffe08a },
  { body: 0x3f9a5a, dark: 0x22592f, light: 0x7bd191 },
  { body: 0x8a5cc9, dark: 0x4d2e7a, light: 0xb894e6 },
];

export function carVariants(): number {
  return VARIANTS.length;
}

export function ensureCarTexture(scene: Phaser.Scene, variant: number): string {
  const v = VARIANTS[variant % VARIANTS.length]!;
  const key = `car:${variant % VARIANTS.length}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = CAR_W; const H = CAR_H;
  // shadow
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(2, 3, W - 3, H - 3, 5);
  // wheels
  g.fillStyle(0x1a1a1e, 1);
  for (const [x, y] of [[5, 0], [W - 11, 0], [5, H - 4], [W - 11, H - 4]] as const) g.fillRoundedRect(x, y, 6, 4, 1);
  // body
  g.fillStyle(v.dark, 1);
  g.fillRoundedRect(1, 2, W - 2, H - 4, 4);
  g.fillStyle(v.body, 1);
  g.fillRoundedRect(2, 3, W - 4, H - 6, 4);
  g.fillStyle(v.light, 0.7);
  g.fillRoundedRect(4, 4, W - 8, 2, 1);
  // roof and windows (windshield toward the front, on the right)
  g.fillStyle(v.dark, 1);
  g.fillRoundedRect(11, 4, 14, H - 8, 2);
  g.fillStyle(0x9fd3ef, 1);
  g.fillRect(23, 5, 3, H - 10);
  g.fillRect(11, 5, 2, H - 10);
  g.fillStyle(0xdff4ff, 0.8);
  g.fillRect(24, 5, 1, 3);
  // lights
  g.fillStyle(0xfff1a8, 1);
  g.fillRect(W - 3, 4, 2, 3); g.fillRect(W - 3, H - 7, 2, 3);
  g.fillStyle(0xff4d4d, 1);
  g.fillRect(1, 4, 2, 3); g.fillRect(1, H - 7, 2, 3);
  g.generateTexture(key, W, H);
  g.destroy();
  return key;
}

/** A soft round puff for steam and clouds. */
export function ensurePuffTexture(scene: Phaser.Scene): string {
  const key = 'fx:puff';
  if (scene.textures.exists(key)) return key;
  const size = 24;
  const canvas = scene.textures.createCanvas(key, size, size);
  if (!canvas) return key;
  const c = canvas.getContext();
  const grd = c.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grd;
  c.fillRect(0, 0, size, size);
  canvas.refresh();
  return key;
}

/** A rain streak. */
export function ensureRainTexture(scene: Phaser.Scene): string {
  const key = 'fx:rain';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xcfe6ff, 0.9);
  g.fillRect(1, 0, 1, 12);
  g.fillStyle(0xffffff, 0.5);
  g.fillRect(1, 0, 1, 3);
  g.generateTexture(key, 3, 12);
  g.destroy();
  return key;
}

/** Two bird frames (wings up / wings down) as one 2-frame spritesheet-like pair of textures. */
export function ensureBirdTextures(scene: Phaser.Scene): [string, string] {
  const keys: [string, string] = ['fx:bird0', 'fx:bird1'];
  keys.forEach((key, i) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(1.6, 0x1a1a24, 1);
    g.beginPath();
    if (i === 0) { g.moveTo(0, 4); g.lineTo(4, 1); g.lineTo(8, 4); }
    else { g.moveTo(0, 1); g.lineTo(4, 4); g.lineTo(8, 1); }
    g.strokePath();
    g.generateTexture(key, 9, 6);
    g.destroy();
  });
  return keys;
}
