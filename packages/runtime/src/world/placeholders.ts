import Phaser from 'phaser';

/**
 * Small code-drawn visuals for entities that carry a city component but no sprite: a coin or parcel for pickups, a
 * striped barrier for locks, and a floating sign for properties and shops. Each texture is generated once per game.
 */
export type PlaceholderKind = 'coin' | 'parcel' | 'barrier' | 'sign_property' | 'sign_shop';

const SIZE: Record<PlaceholderKind, number> = { coin: 16, parcel: 18, barrier: 32, sign_property: 18, sign_shop: 18 };

export function placeholderKey(kind: PlaceholderKind, size: number): string {
  return `ph:${kind}:${size}`;
}

export function ensurePlaceholder(scene: Phaser.Scene, kind: PlaceholderKind, size = SIZE[kind]): string {
  const key = placeholderKey(kind, size);
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g, kind, size);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

function draw(g: Phaser.GameObjects.Graphics, kind: PlaceholderKind, s: number): void {
  const c = s / 2;
  switch (kind) {
    case 'coin': {
      const r = c - 1;
      g.fillStyle(0x8a5a12, 1); g.fillCircle(c, c + 1, r);
      g.fillStyle(0xf6c343, 1); g.fillCircle(c, c, r);
      g.fillStyle(0xd99a1e, 1); g.fillCircle(c, c, r - 2.5);
      g.fillStyle(0xf6c343, 1); g.fillRect(c - 1.5, c - r + 4, 3, r * 2 - 8);
      g.fillStyle(0xfff3b0, 1); g.fillCircle(c - r * 0.4, c - r * 0.45, 1.6);
      break;
    }
    case 'parcel': {
      const w = s - 4;
      g.fillStyle(0x5b3a1a, 1); g.fillRect(2, 3, w, w);
      g.fillStyle(0xb27a3c, 1); g.fillRect(2, 2, w, w - 1);
      g.fillStyle(0xd9a05c, 1); g.fillRect(3, 3, w - 2, Math.floor(w / 3));
      g.fillStyle(0xf1e3c6, 1); g.fillRect(c - 1.5, 2, 3, w - 1); g.fillRect(2, c - 1, w, 3);
      g.lineStyle(1, 0x3d2610, 1); g.strokeRect(2.5, 2.5, w - 1, w - 2);
      break;
    }
    case 'barrier': {
      // Striped road barrier on two posts, with a padlock.
      g.fillStyle(0x000000, 0.25); g.fillEllipse(c, s - 3, s - 4, 6);
      g.fillStyle(0x4a4a55, 1); g.fillRect(4, 10, 4, s - 14); g.fillRect(s - 8, 10, 4, s - 14);
      g.fillStyle(0xf2c94c, 1); g.fillRect(2, 8, s - 4, 9);
      g.fillStyle(0x1b1b22, 1);
      for (let x = 2; x < s - 2; x += 8) g.fillTriangle(x, 8, x + 4, 8, x + 8, 17).fillTriangle(x, 8, x + 4, 17, x, 17);
      g.lineStyle(1, 0x1b1b22, 1); g.strokeRect(2.5, 8.5, s - 5, 9);
      g.fillStyle(0xc9c9d4, 1); g.fillRect(c - 3, 19, 6, 6);
      g.lineStyle(1.5, 0xc9c9d4, 1); g.strokeCircle(c, 19, 2.5);
      g.fillStyle(0x30303a, 1); g.fillRect(c - 0.5, 21, 1, 2);
      break;
    }
    case 'sign_property':
    case 'sign_shop': {
      // A hanging sign board: gold for a property, sky blue for a shop, with a house or a bag glyph.
      const board = kind === 'sign_property' ? 0xf6c343 : 0x6fc3ff;
      const dark = kind === 'sign_property' ? 0x8a5a12 : 0x1d5b86;
      g.fillStyle(0x000000, 0.35); g.fillRoundedRect(2, 3, s - 4, s - 5, 3);
      g.fillStyle(board, 1); g.fillRoundedRect(1, 1, s - 4, s - 5, 3);
      g.lineStyle(1, dark, 1); g.strokeRoundedRect(1.5, 1.5, s - 5, s - 6, 3);
      g.fillStyle(dark, 1);
      if (kind === 'sign_property') {
        g.fillTriangle(c - 1, 4, c - 6, 9, c + 4, 9);
        g.fillRect(c - 4, 9, 6, 4);
      } else {
        g.fillRect(c - 4, 6, 6, 6);
        g.lineStyle(1, dark, 1); g.strokeCircle(c - 1, 5, 2);
      }
      break;
    }
  }
}
