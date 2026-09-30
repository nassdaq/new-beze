import type { Project } from '@beze/project-schema';
import { DAY_START_HOUR } from './economy.js';

/**
 * Pure day/night maths (no Phaser): the ambient light colour and how strongly night lights shine for a moment of
 * the in-game day. The clock is the world's elapsed time over `dayLengthMs` (the economy's when there is one),
 * starting at `startHour`.
 */

export interface Atmosphere {
  /** 0..24 hour of the day. */
  hour: number;
  /** 0 by day, 1 in deep night; lamps scale their intensity by this. */
  night: number;
  /** Ambient light as 0xrrggbb: white at noon, deep blue at night, warm at dawn and dusk. */
  ambient: number;
  /** Sky tint for backdrops and the canvas fallback overlay. */
  sky: number;
}

/** Keyframes over the day: [hour, ambient, sky]. */
const KEYS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0x22284a, 0x0b1030],
  [4.5, 0x2a3058, 0x141a3a],
  [6, 0xd99a7a, 0x6a4a7a],
  [7.5, 0xf6ecdf, 0xa9c7ea],
  [12, 0xffffff, 0xbfe0ff],
  [17, 0xfff1d8, 0xf0c9a0],
  [19, 0xe0895c, 0x7a3b5c],
  [20.5, 0x3a3560, 0x1a1a44],
  [22, 0x24294e, 0x0c1134],
  [24, 0x22284a, 0x0b1030],
];

function lerpColor(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function atmosphereAt(hour: number): Atmosphere {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]![0] <= h) i++;
  const [h0, a0, s0] = KEYS[i]!;
  const [h1, a1, s1] = KEYS[i + 1]!;
  const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
  const smooth = t * t * (3 - 2 * t);
  // Night strength: full from 21:00 to 04:30, fading in from 18:30 and out by 06:30.
  let night = 0;
  if (h >= 21 || h < 4.5) night = 1;
  else if (h >= 18.5) night = (h - 18.5) / 2.5;
  else if (h < 6.5) night = 1 - (h - 4.5) / 2;
  return { hour: h, night: Math.min(1, Math.max(0, night)), ambient: lerpColor(a0, a1, smooth), sky: lerpColor(s0, s1, smooth) };
}

/** The current hour for a project's world clock, or null when the project has no day/night cycle. */
export function clockHour(project: Project, elapsedMs: number): number | null {
  const p = project.settings.presentation;
  if (p?.dayNight === false) return null;
  const length = project.settings.economy?.dayLengthMs ?? p?.dayLengthMs;
  if (!length) return null;
  const start = p?.startHour ?? DAY_START_HOUR;
  const fraction = (Math.max(0, elapsedMs) % length) / length;
  return (start + fraction * 24) % 24;
}

/** Tile tags that shine at night by default: street lamps and lit signs. */
export const DEFAULT_LAMP_TAGS = ['lamp', 'sign_', 'kiosk', 'shelter', 'fountain', 'roof_hatch'] as const;

export function isLampTag(tag: string | undefined, lampTags: readonly string[]): boolean {
  if (!tag) return false;
  return lampTags.some((t) => (t.endsWith('_') ? tag.startsWith(t) : tag === t || tag.startsWith(`${t}_`)));
}
