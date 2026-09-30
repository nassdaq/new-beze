/**
 * A tiny sound-effect synthesizer in the spirit of sfxr: every effect is a handful of numbers rendered to PCM on the
 * fly (no audio files; deterministic, so a name always sounds the same). Pure: `renderSfx` returns samples and can
 * run under Node in tests; the AudioSystem wraps the result in an AudioBuffer.
 */

export type Wave = 'sine' | 'square' | 'saw' | 'triangle' | 'noise';

export interface SfxParams {
  wave: Wave;
  /** Start frequency in Hz, and where it slides to by the end (defaults to the start). */
  freq: number;
  freqEnd?: number;
  /** Slide curve: 1 linear, >1 fast first, <1 slow first. */
  slide?: number;
  /** ADSR in seconds; sustain is a level 0..1. */
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  /** Total length in seconds (release starts at duration - release). */
  duration: number;
  /** Vibrato depth (fraction of frequency) and rate (Hz). */
  vibrato?: number;
  vibratoHz?: number;
  /** Square duty cycle 0..1. */
  duty?: number;
  /** One-pole low-pass cutoff in Hz (and where it slides to). */
  lowpass?: number;
  lowpassEnd?: number;
  /** Bit crush: samples are quantised to this many levels (0 = off). */
  crush?: number;
  /** A second layer (e.g. a noise burst under a tone). */
  layer?: SfxParams;
  /** Repeats the whole envelope this many times (a stutter / arpeggio feel). */
  repeats?: number;
  /** Semitone offsets for each repeat (arpeggios). */
  arp?: number[];
  volume?: number;
}

const TAU = Math.PI * 2;

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Renders one effect to mono samples at `sampleRate`. Deterministic for a given (params, seed). */
export function renderSfx(p: SfxParams, sampleRate = 44100, seed = 1): Float32Array {
  const n = Math.max(1, Math.floor(p.duration * sampleRate));
  const out = new Float32Array(n);
  const rand = rng(seed);
  const attack = p.attack ?? 0.005;
  const decay = p.decay ?? 0.05;
  const sustain = p.sustain ?? 0.6;
  const release = p.release ?? Math.min(0.08, p.duration * 0.4);
  const repeats = Math.max(1, p.repeats ?? 1);
  const segLen = p.duration / repeats;
  const slide = p.slide ?? 1;
  const vol = p.volume ?? 1;
  let phase = 0;
  let lp = 0;
  let lastNoise = 0;
  let noiseHold = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const seg = Math.min(repeats - 1, Math.floor(t / segLen));
    const tl = t - seg * segLen;
    const u = Math.min(1, tl / segLen);
    // envelope
    let env: number;
    if (tl < attack) env = tl / attack;
    else if (tl < attack + decay) env = 1 - (1 - sustain) * ((tl - attack) / decay);
    else if (tl > segLen - release) env = sustain * Math.max(0, (segLen - tl) / release);
    else env = sustain;
    // frequency
    const k = Math.pow(u, slide);
    let f = p.freq + ((p.freqEnd ?? p.freq) - p.freq) * k;
    if (p.arp && p.arp.length) f *= Math.pow(2, (p.arp[seg % p.arp.length] ?? 0) / 12);
    if (p.vibrato) f *= 1 + p.vibrato * Math.sin(TAU * (p.vibratoHz ?? 6) * t);
    phase += f / sampleRate;
    if (phase > 1) phase -= Math.floor(phase);
    let s: number;
    switch (p.wave) {
      case 'sine': s = Math.sin(TAU * phase); break;
      case 'square': s = phase < (p.duty ?? 0.5) ? 1 : -1; break;
      case 'saw': s = 2 * phase - 1; break;
      case 'triangle': s = 1 - 4 * Math.abs(phase - 0.5); break;
      default: {
        // noise held per cycle of f so its pitch follows the slide (as sfxr does).
        noiseHold += f / sampleRate * 2;
        if (noiseHold >= 1) { noiseHold -= Math.floor(noiseHold); lastNoise = rand() * 2 - 1; }
        s = lastNoise;
      }
    }
    if (p.lowpass) {
      const cutoff = p.lowpass + ((p.lowpassEnd ?? p.lowpass) - p.lowpass) * u;
      const a = 1 - Math.exp(-TAU * Math.min(cutoff, sampleRate / 2.5) / sampleRate);
      lp += a * (s - lp);
      s = lp;
    }
    if (p.crush && p.crush > 1) s = Math.round(s * p.crush) / p.crush;
    out[i] = s * env * vol;
  }
  if (p.layer) {
    const layer = renderSfx(p.layer, sampleRate, seed + 7);
    for (let i = 0; i < Math.min(n, layer.length); i++) out[i] = out[i]! + layer[i]!;
  }
  // soft clip
  for (let i = 0; i < n; i++) { const v = out[i]!; out[i] = v > 1 ? 1 : v < -1 ? -1 : v - (v * v * v) / 3; }
  return out;
}

/** The effects the runtime plays by name. Tuned by ear; every game shares them. */
export const SFX: Record<string, SfxParams> = {
  // --- combat
  swing: { wave: 'noise', freq: 900, freqEnd: 300, duration: 0.14, attack: 0.005, decay: 0.05, sustain: 0.5, lowpass: 3000, lowpassEnd: 600, volume: 0.35 },
  punch: { wave: 'sine', freq: 180, freqEnd: 50, slide: 0.6, duration: 0.18, decay: 0.08, sustain: 0.3, volume: 0.9, layer: { wave: 'noise', freq: 1200, freqEnd: 200, duration: 0.09, sustain: 0.4, lowpass: 2500, volume: 0.5 } },
  hit: { wave: 'square', freq: 220, freqEnd: 90, slide: 0.7, duration: 0.16, decay: 0.06, sustain: 0.35, crush: 12, volume: 0.55, layer: { wave: 'noise', freq: 2400, freqEnd: 300, duration: 0.12, sustain: 0.5, lowpass: 4000, lowpassEnd: 800, volume: 0.45 } },
  hurt: { wave: 'saw', freq: 240, freqEnd: 110, duration: 0.32, attack: 0.005, decay: 0.1, sustain: 0.55, lowpass: 1800, volume: 0.6, layer: { wave: 'noise', freq: 800, freqEnd: 200, duration: 0.2, sustain: 0.5, lowpass: 1200, volume: 0.35 } },
  enemy_down: { wave: 'square', freq: 520, freqEnd: 60, slide: 1.4, duration: 0.45, decay: 0.1, sustain: 0.6, duty: 0.3, crush: 10, volume: 0.5, layer: { wave: 'noise', freq: 1500, freqEnd: 150, duration: 0.4, sustain: 0.5, lowpass: 2500, lowpassEnd: 300, volume: 0.4 } },
  game_over: { wave: 'triangle', freq: 330, freqEnd: 82, slide: 0.8, duration: 1.4, attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.5, vibrato: 0.02, vibratoHz: 4, lowpass: 1600, volume: 0.6 },
  sense: { wave: 'sine', freq: 1600, freqEnd: 2200, duration: 0.22, attack: 0.002, decay: 0.05, sustain: 0.5, repeats: 3, volume: 0.35 },
  // --- web
  web: { wave: 'noise', freq: 4000, freqEnd: 700, slide: 0.5, duration: 0.2, attack: 0.002, decay: 0.05, sustain: 0.6, lowpass: 6000, lowpassEnd: 1500, volume: 0.45, layer: { wave: 'sine', freq: 1400, freqEnd: 400, duration: 0.12, sustain: 0.4, volume: 0.25 } },
  web_hit: { wave: 'noise', freq: 1200, freqEnd: 300, duration: 0.14, sustain: 0.5, lowpass: 2200, volume: 0.4, layer: { wave: 'triangle', freq: 600, freqEnd: 200, duration: 0.1, sustain: 0.4, volume: 0.3 } },
  zip: { wave: 'noise', freq: 400, freqEnd: 3000, slide: 1.6, duration: 0.3, attack: 0.02, decay: 0.05, sustain: 0.7, lowpass: 900, lowpassEnd: 5000, volume: 0.4 },
  land: { wave: 'sine', freq: 140, freqEnd: 60, duration: 0.12, sustain: 0.4, volume: 0.6, layer: { wave: 'noise', freq: 900, freqEnd: 200, duration: 0.1, sustain: 0.4, lowpass: 1500, volume: 0.3 } },
  // --- pickups and rewards
  coin: { wave: 'square', freq: 988, duration: 0.24, attack: 0.002, decay: 0.03, sustain: 0.6, duty: 0.4, repeats: 2, arp: [0, 5], volume: 0.35 },
  pickup: { wave: 'triangle', freq: 660, duration: 0.3, attack: 0.002, decay: 0.05, sustain: 0.6, repeats: 3, arp: [0, 4, 7], volume: 0.4 },
  discover: { wave: 'triangle', freq: 523, duration: 0.7, attack: 0.005, decay: 0.08, sustain: 0.6, repeats: 4, arp: [0, 4, 7, 12], volume: 0.4 },
  quest_start: { wave: 'square', freq: 392, duration: 0.6, attack: 0.005, decay: 0.06, sustain: 0.7, duty: 0.35, repeats: 3, arp: [0, 5, 12], volume: 0.35, layer: { wave: 'triangle', freq: 196, duration: 0.6, attack: 0.01, sustain: 0.5, repeats: 3, arp: [0, 5, 12], volume: 0.3 } },
  quest_done: { wave: 'square', freq: 523, duration: 1.1, attack: 0.005, decay: 0.08, sustain: 0.7, duty: 0.4, repeats: 5, arp: [0, 4, 7, 12, 16], volume: 0.35, layer: { wave: 'triangle', freq: 261, duration: 1.1, attack: 0.01, sustain: 0.6, repeats: 5, arp: [0, 4, 7, 12, 16], volume: 0.35 } },
  quest_fail: { wave: 'square', freq: 440, duration: 0.9, attack: 0.005, decay: 0.1, sustain: 0.6, duty: 0.3, repeats: 3, arp: [0, -3, -8], lowpass: 2000, volume: 0.35 },
  level_up: { wave: 'triangle', freq: 523, duration: 1.3, attack: 0.005, decay: 0.06, sustain: 0.7, repeats: 6, arp: [0, 4, 7, 12, 19, 24], volume: 0.4, layer: { wave: 'sine', freq: 1046, duration: 1.3, attack: 0.3, sustain: 0.5, volume: 0.2 } },
  unlock: { wave: 'sine', freq: 784, duration: 0.6, attack: 0.005, decay: 0.1, sustain: 0.6, repeats: 2, arp: [0, 7], volume: 0.4, layer: { wave: 'noise', freq: 3000, freqEnd: 500, duration: 0.2, sustain: 0.4, lowpass: 3000, volume: 0.25 } },
  buy: { wave: 'square', freq: 880, duration: 0.3, attack: 0.002, decay: 0.04, sustain: 0.6, duty: 0.5, repeats: 2, arp: [0, 12], volume: 0.3 },
  deny: { wave: 'square', freq: 220, freqEnd: 180, duration: 0.25, sustain: 0.6, duty: 0.2, repeats: 2, volume: 0.3 },
  // --- interface
  ui_move: { wave: 'square', freq: 1200, duration: 0.05, attack: 0.001, decay: 0.02, sustain: 0.4, duty: 0.3, volume: 0.18 },
  ui_confirm: { wave: 'square', freq: 880, freqEnd: 1320, duration: 0.12, attack: 0.001, decay: 0.03, sustain: 0.5, duty: 0.4, volume: 0.25 },
  ui_cancel: { wave: 'square', freq: 660, freqEnd: 440, duration: 0.12, attack: 0.001, decay: 0.03, sustain: 0.5, duty: 0.4, volume: 0.22 },
  ui_open: { wave: 'triangle', freq: 520, freqEnd: 780, duration: 0.16, attack: 0.002, decay: 0.05, sustain: 0.5, volume: 0.25 },
  type: { wave: 'square', freq: 1800, duration: 0.03, attack: 0.001, decay: 0.01, sustain: 0.3, duty: 0.25, volume: 0.12 },
  card: { wave: 'sine', freq: 330, freqEnd: 660, slide: 0.5, duration: 0.5, attack: 0.01, decay: 0.1, sustain: 0.6, volume: 0.3, layer: { wave: 'noise', freq: 2000, freqEnd: 400, duration: 0.25, sustain: 0.5, lowpass: 3500, lowpassEnd: 500, volume: 0.25 } },
  door: { wave: 'noise', freq: 600, freqEnd: 150, duration: 0.35, attack: 0.02, decay: 0.1, sustain: 0.6, lowpass: 1200, lowpassEnd: 300, volume: 0.35 },
  title_start: { wave: 'triangle', freq: 392, duration: 0.9, attack: 0.005, decay: 0.08, sustain: 0.7, repeats: 4, arp: [0, 7, 12, 19], volume: 0.4, layer: { wave: 'noise', freq: 4000, freqEnd: 300, duration: 0.6, sustain: 0.5, lowpass: 5000, lowpassEnd: 400, volume: 0.2 } },
  thunder: { wave: 'noise', freq: 120, freqEnd: 40, slide: 0.5, duration: 2.2, attack: 0.05, decay: 0.6, sustain: 0.5, release: 1.2, lowpass: 400, lowpassEnd: 120, volume: 0.7 },
  step: { wave: 'noise', freq: 500, freqEnd: 200, duration: 0.06, attack: 0.002, decay: 0.02, sustain: 0.4, lowpass: 1200, volume: 0.12 },
};

export type SfxName = keyof typeof SFX;
