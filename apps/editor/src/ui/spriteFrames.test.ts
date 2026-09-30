import { describe, expect, it } from 'vitest';
import type { Character } from '@beze/project-schema';
import { fitScale, frameAt, frameRect, previewAnimation, sheetColumns, strikeFrame } from './spriteFrames.js';

const anim = (frames: number[], frameRate = 8, loop = true) => ({ frames, frameRate, loop });
const character: Character = {
  id: 'chr_test', name: 'Test', spriteSheetAssetId: 'ast_test', frameWidth: 48, frameHeight: 64,
  animations: {
    idle_down: anim([0], 1), idle_left: anim([4], 1), idle_right: anim([8], 1), idle_up: anim([12], 1),
    walk_down: anim([0, 1, 2, 3]), walk_left: anim([4, 5, 6, 7]), walk_right: anim([8, 9, 10, 11]), walk_up: anim([12, 13, 14, 15]),
    attack_down: anim([16, 17, 18], 10),
  },
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
};

describe('spriteFrames', () => {
  it('reads frames left to right, top to bottom, like the viewport renderer', () => {
    expect(sheetColumns(character, 192)).toBe(4);
    expect(frameRect(character, 0, 192)).toEqual({ sx: 0, sy: 0, w: 48, h: 64 });
    expect(frameRect(character, 5, 192)).toEqual({ sx: 48, sy: 64, w: 48, h: 64 });
    expect(frameRect(character, 17, 192)).toEqual({ sx: 48, sy: 256, w: 48, h: 64 });
  });

  it('never divides by zero columns on a sheet narrower than one frame', () => {
    expect(sheetColumns(character, 10)).toBe(1);
    expect(frameRect(character, 3, 10)).toEqual({ sx: 0, sy: 192, w: 48, h: 64 });
  });

  it('falls back to idle when an optional animation is missing', () => {
    expect(previewAnimation(character, 'attack', 'down').frames).toEqual([16, 17, 18]);
    expect(previewAnimation(character, 'attack', 'left').frames).toEqual([4]);
    expect(previewAnimation(character, 'walk', 'up').frames).toEqual([12, 13, 14, 15]);
  });

  it('picks the middle attack frame as the strike', () => {
    expect(strikeFrame(character, 'down')).toBe(17);
    expect(strikeFrame(character, 'up')).toBeNull();
  });

  it('fits frames into a square box with integer upscales and uniform downscales', () => {
    expect(fitScale(48, 64, 64)).toBe(1);
    expect(fitScale(48, 64, 128)).toBe(2);
    expect(fitScale(48, 64, 32)).toBeCloseTo(0.5);
    expect(fitScale(16, 16, 40)).toBe(2);
  });

  it('cycles frames at the animation frame rate', () => {
    const frames = [4, 5, 6, 7];
    expect(frameAt(frames, 8, 0)).toBe(4);
    expect(frameAt(frames, 8, 125)).toBe(5);
    expect(frameAt(frames, 8, 500)).toBe(4);
    expect(frameAt([], 8, 100)).toBe(0);
  });
});
