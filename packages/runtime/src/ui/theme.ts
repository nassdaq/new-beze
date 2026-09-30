import type Phaser from 'phaser';
import { FONT_DISPLAY, FONT_UI } from './fonts.js';

/**
 * The runtime draws its interface at `UI_SCALE` × the document's viewport (a 480×270 game renders on a 960×540
 * canvas; the world camera zooms 2× so tiles stay the same size on screen while text, panels and effects get the
 * extra pixels). Every interface measurement below is in canvas pixels.
 */
export const UI_SCALE = 2;

export const UI = {
  font: FONT_UI,
  display: FONT_DISPLAY,
  /** Panels: near-black indigo with a soft light rim. */
  panel: 0x121320,
  panelAlpha: 0.94,
  panelSoft: 0x1c1d2e,
  rim: 0xffffff,
  rimAlpha: 0.16,
  stroke: 0xf2f2f2,
  dim: 0x05060c,
  dimAlpha: 0.6,
  text: '#f4f4f8',
  muted: '#9aa0b4',
  mutedInt: 0x9aa0b4,
  accent: '#ffd166',
  accentInt: 0xffd166,
  accentDeep: 0xd9922e,
  coin: '#ffc857',
  coinInt: 0xffc857,
  good: '#7ee081',
  goodInt: 0x7ee081,
  bad: '#ff5c7a',
  badInt: 0xff5c7a,
  info: '#8fd3ff',
  infoInt: 0x8fd3ff,
  xp: 0x5ec8ff,
  xpDeep: 0x2d6fa8,
  heart: 0xff4d6d,
  heartDeep: 0x7a1030,
  star: '#ffd166',
  web: 0xffffff,
} as const;

export type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

const base = (size: number, weight = 600, color: string = UI.text): TextStyle => ({ fontFamily: UI.font, fontSize: `${size}px`, fontStyle: String(weight), color });

export const TEXT = {
  small: base(15, 600),
  body: base(19, 600),
  bold: base(19, 800),
  label: base(14, 800, UI.muted),
  title: base(26, 800, UI.accent),
  hint: base(14, 600, UI.muted),
  /** Display face for big moments: titles, mission cards, level ups. */
  display: (size: number, color: string = UI.text): TextStyle => ({ fontFamily: UI.display, fontSize: `${size}px`, color, letterSpacing: 1 }),
} as const;

/** Depth bands inside the overlay scenes. */
export const DEPTH = { dim: 0, panel: 1, content: 2, top: 3 } as const;

/** A rounded panel: drop shadow, fill, 1 px light rim, drawn into `g` at (x, y). */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, opts: { radius?: number; fill?: number; alpha?: number; rim?: number; rimAlpha?: number; shadow?: boolean } = {}): void {
  const r = opts.radius ?? 12;
  if (opts.shadow !== false) {
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x + 2, y + 4, w, h, r);
  }
  g.fillStyle(opts.fill ?? UI.panel, opts.alpha ?? UI.panelAlpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1.5, opts.rim ?? UI.rim, opts.rimAlpha ?? UI.rimAlpha);
  g.strokeRoundedRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
}

/** A keycap glyph ("E", "X", "SPACE"): a light rounded key with the letter, for prompts and hints. */
export function keycap(scene: Phaser.Scene, x: number, y: number, label: string, size = 22): Phaser.GameObjects.Container {
  const w = Math.max(size, label.length * (size * 0.5) + size * 0.6);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.45); g.fillRoundedRect(-w / 2 + 1, -size / 2 + 3, w, size, 5);
  g.fillStyle(0xf4f4f8, 1); g.fillRoundedRect(-w / 2, -size / 2, w, size, 5);
  g.fillStyle(0xc9cbd8, 1); g.fillRoundedRect(-w / 2, size / 2 - 4, w, 4, { tl: 0, tr: 0, bl: 5, br: 5 });
  const t = scene.add.text(0, -1, label, { fontFamily: UI.font, fontSize: `${Math.round(size * 0.58)}px`, fontStyle: '900', color: '#1c1d2e' }).setOrigin(0.5);
  return scene.add.container(x, y, [g, t]);
}
