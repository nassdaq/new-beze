import type { AnimationName, Character, Direction } from '@beze/project-schema';

/** Source rectangle of one frame on a character's sheet. Frames are numbered left to right, top to bottom. */
export interface FrameRect { sx: number; sy: number; w: number; h: number }

/** Columns on the sheet, derived from the image width the same way the viewport renderer does it. */
export function sheetColumns(character: Pick<Character, 'frameWidth'>, imageWidth: number): number {
  return Math.max(1, Math.floor(imageWidth / character.frameWidth));
}

export function frameRect(character: Pick<Character, 'frameWidth' | 'frameHeight'>, frame: number, imageWidth: number): FrameRect {
  const cols = sheetColumns(character, imageWidth);
  return {
    sx: (frame % cols) * character.frameWidth,
    sy: Math.floor(frame / cols) * character.frameHeight,
    w: character.frameWidth,
    h: character.frameHeight,
  };
}

export type PreviewAnim = 'idle' | 'walk' | 'attack';

/** The animation a preview should show, falling back to idle when an optional animation is missing. */
export function previewAnimation(character: Character, anim: PreviewAnim, facing: Direction): { frames: number[]; frameRate: number } {
  const name = `${anim}_${facing}` as AnimationName;
  const a = character.animations[name] ?? character.animations[`idle_${facing}`];
  return { frames: a.frames.length > 0 ? a.frames : [0], frameRate: a.frameRate };
}

/** The "strike" of an attack: the middle frame of the swing, or null when the character cannot attack that way. */
export function strikeFrame(character: Character, facing: Direction): number | null {
  const a = character.animations[`attack_${facing}`];
  if (!a || a.frames.length === 0) return null;
  return a.frames[Math.floor((a.frames.length - 1) / 2)] ?? null;
}

/**
 * Scale that fits a frame into a square box of `size` css pixels. Integer scales keep pixel art crisp
 * when the box is larger than the frame; smaller boxes shrink uniformly.
 */
export function fitScale(frameWidth: number, frameHeight: number, size: number): number {
  const raw = Math.min(size / frameWidth, size / frameHeight);
  return raw >= 1 ? Math.floor(raw) : raw;
}

/** Which frame of a cycle is showing `elapsedMs` after it started. */
export function frameAt(frames: number[], frameRate: number, elapsedMs: number): number {
  if (frames.length === 0) return 0;
  const i = Math.floor((elapsedMs / 1000) * Math.max(1, frameRate)) % frames.length;
  return frames[i] ?? frames[0] ?? 0;
}
