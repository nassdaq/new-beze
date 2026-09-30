import { describe, expect, it } from 'vitest';
import { renderSfx, SFX } from '../src/audio/synth.js';
import { composeBar, degreeNote, midiToHz, MOOD, MOODS } from '../src/audio/music.js';

describe('sfx synthesizer', () => {
  it('renders every preset to bounded, non-silent samples, deterministically', () => {
    for (const [name, params] of Object.entries(SFX)) {
      const a = renderSfx(params, 22050);
      const b = renderSfx(params, 22050);
      expect(a.length, name).toBe(Math.floor(params.duration * 22050));
      let peak = 0;
      for (let i = 0; i < a.length; i++) { peak = Math.max(peak, Math.abs(a[i]!)); expect(a[i]).toBeCloseTo(b[i]!, 10); }
      expect(peak, name).toBeGreaterThan(0.02);
      expect(peak, name).toBeLessThanOrEqual(1);
    }
  });

  it('slides pitch: a falling effect has a longer period at the end than at the start', () => {
    const s = renderSfx({ wave: 'sine', freq: 800, freqEnd: 100, duration: 0.5, sustain: 1, release: 0.001 }, 8000);
    const crossings = (from: number, to: number) => { let n = 0; for (let i = from + 1; i < to; i++) if (s[i - 1]! < 0 && s[i]! >= 0) n++; return n; };
    expect(crossings(0, 800)).toBeGreaterThan(crossings(3200, 4000) * 2);
  });
});

describe('generative music', () => {
  it('every mood composes bars for both quiet and intense play, deterministically', () => {
    for (const mood of MOODS) {
      const quiet = composeBar(mood, 0, 0);
      const loud = composeBar(mood, 0, 1);
      expect(quiet.length).toBeGreaterThan(0);
      expect(loud.length).toBeGreaterThan(quiet.length);
      expect(composeBar(mood, 5, 0.5)).toEqual(composeBar(mood, 5, 0.5));
      for (const e of quiet) {
        expect(e.beat).toBeGreaterThanOrEqual(0);
        expect(e.beat).toBeLessThan(4.5);
        expect(e.velocity).toBeGreaterThan(0);
      }
      const quietLayers = new Set(quiet.map((e) => e.layer));
      for (const layer of MOOD[mood].base) expect(quietLayers.has(layer), `${mood} ${layer}`).toBe(true);
    }
  });

  it('keeps notes in key and in a sane register', () => {
    const def = MOOD.city;
    expect(degreeNote(def, 0)).toBe(def.root);
    expect(degreeNote(def, 7)).toBe(def.root + 12);
    expect(degreeNote(def, -1)).toBe(def.root - 2);
    for (const e of composeBar('city', 3, 1)) {
      if (['kick', 'snare', 'hat'].includes(e.layer)) continue;
      expect(e.note).toBeGreaterThan(20);
      expect(e.note).toBeLessThan(100);
      const semis = ((e.note - def.root) % 12 + 12) % 12;
      expect(def.scale.includes(semis), `${e.layer} ${e.note}`).toBe(true);
    }
    expect(midiToHz(69)).toBe(440);
  });
});
