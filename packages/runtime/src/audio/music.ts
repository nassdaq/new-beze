/**
 * Generative music, pure part: moods define tempo, scale and chord progression; `composeBar` turns a bar index into
 * note events for the bass, chords, arpeggio, melody and drum layers. Deterministic per (mood, bar): the same bar
 * always sounds the same, so a game has a recognisable theme, and the melody varies from phrase to phrase. The
 * AudioSystem schedules the events with Web Audio.
 */

export type Mood = 'city' | 'calm' | 'tense' | 'title' | 'night';
export const MOODS: readonly Mood[] = ['city', 'calm', 'tense', 'title', 'night'];

export type Layer = 'bass' | 'chord' | 'arp' | 'lead' | 'kick' | 'snare' | 'hat';

export interface NoteEvent {
  layer: Layer;
  /** Beat offset inside the bar (0..4, fractional). */
  beat: number;
  /** Length in beats. */
  length: number;
  /** MIDI note number (ignored for drums). */
  note: number;
  /** 0..1 */
  velocity: number;
}

export interface MoodDef {
  bpm: number;
  /** Root MIDI note of the key. */
  root: number;
  /** Scale intervals in semitones. */
  scale: number[];
  /** Chord progression as scale degrees (0-based) over 4-bar phrases; chords are stacked thirds on the scale. */
  progression: number[];
  /** Which layers play at intensity 0 and which join as it rises. */
  base: Layer[];
  intense: Layer[];
  swing: number;
  /** Master timbre hints. */
  bright: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const MOOD: Record<Mood, MoodDef> = {
  city: { bpm: 100, root: 45, scale: DORIAN, progression: [0, 5, 2, 6], base: ['bass', 'chord', 'kick', 'hat'], intense: ['snare', 'arp', 'lead'], swing: 0.12, bright: 0.7 },
  calm: { bpm: 78, root: 48, scale: MAJOR, progression: [0, 5, 3, 4], base: ['chord', 'bass'], intense: ['arp', 'lead', 'hat'], swing: 0.0, bright: 0.5 },
  tense: { bpm: 136, root: 40, scale: MINOR, progression: [0, 5, 6, 4], base: ['bass', 'kick', 'hat', 'chord'], intense: ['snare', 'arp', 'lead'], swing: 0.0, bright: 0.9 },
  title: { bpm: 92, root: 43, scale: DORIAN, progression: [0, 5, 3, 6], base: ['chord', 'bass', 'arp'], intense: ['lead', 'kick', 'snare', 'hat'], swing: 0.05, bright: 0.8 },
  night: { bpm: 84, root: 45, scale: MINOR, progression: [0, 3, 5, 6], base: ['bass', 'chord', 'hat'], intense: ['arp', 'lead', 'kick'], swing: 0.16, bright: 0.4 },
};

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** MIDI note of scale degree `deg` (any integer) in the mood's key, `octave` octaves above the root. */
export function degreeNote(def: MoodDef, deg: number, octave = 0): number {
  const len = def.scale.length;
  const oct = Math.floor(deg / len);
  const idx = ((deg % len) + len) % len;
  return def.root + def.scale[idx]! + (oct + octave) * 12;
}

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * Notes for one bar of the mood at a given intensity (0..1): the base layers always, the intense layers when the
 * intensity clears their threshold. Bar 0 of every 8-bar phrase restates the motif; the others vary it.
 */
export function composeBar(mood: Mood, bar: number, intensity: number): NoteEvent[] {
  const def = MOOD[mood];
  const events: NoteEvent[] = [];
  const chordDeg = def.progression[bar % def.progression.length]!;
  const phraseBar = bar % 8;
  const r = rng(bar * 7919 + mood.length * 31);
  const on = (layer: Layer): boolean => {
    if (def.base.includes(layer)) return true;
    const i = def.intense.indexOf(layer);
    if (i < 0) return false;
    return intensity >= (i + 1) / (def.intense.length + 1);
  };
  const chord = [0, 2, 4, 6].map((n) => degreeNote(def, chordDeg + n, 1));

  if (on('bass')) {
    const rootLow = degreeNote(def, chordDeg, 0) - 12;
    const fifth = rootLow + 7;
    const pattern = mood === 'tense' ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : mood === 'calm' ? [0, 2.5] : [0, 1.5, 2, 3.5];
    pattern.forEach((b, i) => events.push({ layer: 'bass', beat: b, length: mood === 'calm' ? 1.6 : 0.45, note: i % 3 === 2 ? fifth : rootLow, velocity: i === 0 ? 0.9 : 0.7 }));
  }
  if (on('chord')) {
    const stabs = mood === 'city' || mood === 'night' ? [0, 1.5, 3] : mood === 'tense' ? [0, 2] : [0];
    for (const b of stabs) for (const n of chord.slice(0, 3)) events.push({ layer: 'chord', beat: b, length: mood === 'calm' || mood === 'title' ? 3.8 : 0.9, note: n, velocity: 0.5 });
  }
  if (on('arp')) {
    for (let i = 0; i < 8; i++) {
      const n = chord[[0, 1, 2, 3, 2, 1, 2, 3][i]!]! + 12;
      events.push({ layer: 'arp', beat: i * 0.5, length: 0.4, note: n, velocity: 0.35 + (i % 2 === 0 ? 0.15 : 0) });
    }
  }
  if (on('lead')) {
    // A motif on the phrase's first bar, answered with variations after; rests keep it breathing.
    const motif = [0, 2, 4, 2, 5, 4, 2, 0];
    let beat = 0;
    for (let i = 0; i < 6 && beat < 4; i++) {
      const rest = phraseBar !== 0 && r() < 0.3;
      const len = r() < 0.35 ? 1 : 0.5;
      if (!rest) {
        const step = phraseBar === 0 ? motif[i % motif.length]! : motif[i % motif.length]! + (r() < 0.5 ? 0 : r() < 0.5 ? 1 : -1);
        events.push({ layer: 'lead', beat, length: len * 0.9, note: degreeNote(def, chordDeg + step, 2), velocity: 0.45 });
      }
      beat += len;
    }
  }
  if (on('kick')) {
    const beats = mood === 'tense' ? [0, 1, 2, 3] : mood === 'city' ? [0, 2.5] : [0, 2];
    for (const b of beats) events.push({ layer: 'kick', beat: b, length: 0.2, note: 36, velocity: 0.9 });
  }
  if (on('snare')) for (const b of [1, 3]) events.push({ layer: 'snare', beat: b, length: 0.15, note: 38, velocity: 0.7 });
  if (on('hat')) {
    const n = mood === 'calm' ? 4 : 8;
    for (let i = 0; i < n; i++) events.push({ layer: 'hat', beat: (i * 4) / n + (i % 2 ? def.swing : 0), length: 0.08, note: 42, velocity: i % 2 ? 0.3 : 0.5 });
  }
  return events;
}

/** Seconds per beat for a mood. */
export function beatSeconds(mood: Mood): number {
  return 60 / MOOD[mood].bpm;
}
