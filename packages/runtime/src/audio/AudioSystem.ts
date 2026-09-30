import type Phaser from 'phaser';
import type { Project } from '@beze/project-schema';
import { beatSeconds, composeBar, midiToHz, MOOD, type Mood, type NoteEvent } from './music.js';
import { renderSfx, SFX, type SfxName } from './synth.js';

/** Key of a loaded audio asset in Phaser's cache. */
export const audioKey = (assetId: string): string => `aud:${assetId}`;

const LOOKAHEAD_S = 0.6;
const TICK_MS = 120;
const DUCK_LEVEL = 0.35;

interface MusicState {
  mood: Mood;
  bar: number;
  /** AudioContext time the next bar starts. */
  nextBar: number;
  gain: GainNode;
  /** Scheduled source nodes still to end; stopped on a hard cut. */
  live: Set<AudioScheduledSourceNode>;
}

/**
 * Sound for the whole game, shared through the registry under 'audio'. Effects are synthesized once per name and
 * cached; music is generated bar by bar from a mood (see music.ts) or played from an uploaded track. Layers join
 * with `intensity` (combat nearby), menus duck the music, and everything runs off Phaser's own AudioContext so the
 * browser's autoplay unlock is handled for us. Without Web Audio the system is inert.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private duckBus!: GainNode;
  private delay!: DelayNode;
  private buffers = new Map<string, AudioBuffer>();
  private noise: AudioBuffer | null = null;
  private music: MusicState | null = null;
  private track: Phaser.Sound.BaseSound | null = null;
  private trackKey: string | null = null;
  private wanted: { kind: 'mood'; mood: Mood } | { kind: 'track'; key: string } | { kind: 'none' } = { kind: 'none' };
  private timer: ReturnType<typeof setInterval> | null = null;
  private intensity = 0;
  private intensityTarget = 0;
  private ducked = 0;
  private lastSfxAt = new Map<string, number>();

  constructor(private game: Phaser.Game, project: Project) {
    const manager = game.sound as Phaser.Sound.WebAudioSoundManager & { context?: AudioContext };
    const ctx = manager.context;
    if (!ctx || typeof ctx.createGain !== 'function') return;
    this.ctx = ctx;
    const a = project.settings.audio;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = a?.sfxVolume ?? 0.8;
    this.sfxBus.connect(this.master);
    this.duckBus = ctx.createGain();
    this.duckBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = a?.musicVolume ?? 0.45;
    this.musicBus.connect(this.duckBus);
    // A short feedback delay gives the arpeggios and leads some room.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.28;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(wet); wet.connect(this.musicBus);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    game.events.once('destroy', () => this.dispose());
  }

  get enabled(): boolean {
    return this.ctx !== null;
  }

  static of(scene: Phaser.Scene): AudioSystem | null {
    return (scene.registry.get('audio') as AudioSystem | undefined) ?? null;
  }

  // ------------------------------------------------------------------ effects

  /** Plays a named effect. `rate` shifts pitch (1 = as rendered); the same name is rate-limited to every 30 ms. */
  sfx(name: SfxName | string, opts: { volume?: number; rate?: number; pan?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'suspended') return;
    const now = performance.now();
    if (now - (this.lastSfxAt.get(name) ?? -1000) < 30) return;
    this.lastSfxAt.set(name, now);
    const buffer = this.buffer(name);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g);
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p); p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    src.start();
  }

  private buffer(name: string): AudioBuffer | null {
    const ctx = this.ctx!;
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const params = SFX[name];
    if (!params) return null;
    const pcm = renderSfx(params, ctx.sampleRate);
    const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buf.copyToChannel(new Float32Array(pcm), 0);
    this.buffers.set(name, buf);
    return buf;
  }

  // ------------------------------------------------------------------- music

  /** Generated music of a mood; switching moods crossfades at the next bar. */
  playMood(mood: Mood): void {
    if (this.wanted.kind === 'mood' && this.wanted.mood === mood) return;
    this.wanted = { kind: 'mood', mood };
    this.stopTrack();
    if (this.music && this.music.mood !== mood) this.fadeOutMusic(this.music, 0.8);
    if (!this.music || this.music.mood !== mood) this.music = null;
  }

  /** An uploaded track (loaded by the boot scene under `audioKey`), looping. */
  playTrack(key: string, volume = 1): void {
    if (this.wanted.kind === 'track' && this.trackKey === key) return;
    this.wanted = { kind: 'track', key };
    if (this.music) { this.fadeOutMusic(this.music, 0.8); this.music = null; }
    this.stopTrack();
    if (!this.game.cache.audio.exists(key)) return;
    this.track = this.game.sound.add(key, { loop: true, volume: 0 });
    this.trackKey = key;
    this.track.play();
    fadeSound(this.track, (this.musicBus?.gain.value ?? 0.5) * volume, 900);
  }

  stopMusic(): void {
    this.wanted = { kind: 'none' };
    if (this.music) { this.fadeOutMusic(this.music, 0.6); this.music = null; }
    this.stopTrack();
  }

  private stopTrack(): void {
    if (!this.track) return;
    const t = this.track;
    this.track = null;
    this.trackKey = null;
    fadeSound(t, 0, 500, () => { t.stop(); t.destroy(); });
  }

  /** How much of the combat layers to bring in (0 calm .. 1 full). Smoothed over a couple of seconds. */
  setIntensity(v: number): void {
    this.intensityTarget = Math.max(0, Math.min(1, v));
  }

  /** Menus and dialogue lower the music; `level` 1 = full duck. */
  duck(level: number): void {
    if (!this.ctx) return;
    this.ducked = level;
    const target = 1 - (1 - DUCK_LEVEL) * Math.max(0, Math.min(1, level));
    this.duckBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.duckBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  setVolumes(music: number, sfx: number): void {
    if (!this.ctx) return;
    this.musicBus.gain.value = music;
    this.sfxBus.gain.value = sfx;
  }

  private fadeOutMusic(m: MusicState, seconds: number): void {
    const ctx = this.ctx!;
    m.gain.gain.cancelScheduledValues(ctx.currentTime);
    m.gain.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
    setTimeout(() => { for (const n of m.live) { try { n.stop(); } catch { /* already ended */ } } m.gain.disconnect(); }, seconds * 1000 + 100);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.intensity += (this.intensityTarget - this.intensity) * 0.08;
    if (this.wanted.kind !== 'mood') return;
    if (!this.music) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.musicBus);
      gain.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
      this.music = { mood: this.wanted.mood, bar: 0, nextBar: ctx.currentTime + 0.1, gain, live: new Set() };
    }
    const m = this.music;
    const barLen = beatSeconds(m.mood) * 4;
    while (m.nextBar < ctx.currentTime + LOOKAHEAD_S) {
      if (m.nextBar >= ctx.currentTime - 0.05) this.scheduleBar(m, m.nextBar, composeBar(m.mood, m.bar, this.intensity));
      m.bar++;
      m.nextBar += barLen;
    }
  }

  private scheduleBar(m: MusicState, start: number, events: NoteEvent[]): void {
    const def = MOOD[m.mood];
    const beat = beatSeconds(m.mood);
    for (const e of events) {
      const t = start + e.beat * beat;
      const len = e.length * beat;
      switch (e.layer) {
        case 'bass': this.tone(m, t, len, midiToHz(e.note), 'triangle', e.velocity * 0.9, 380, 0.01, 0.12, false); break;
        case 'chord': this.tone(m, t, len, midiToHz(e.note), 'sawtooth', e.velocity * 0.22, 700 + 900 * def.bright, 0.06, 0.25, false, 6); break;
        case 'arp': this.tone(m, t, len, midiToHz(e.note), 'square', e.velocity * 0.18, 1800 + 1500 * def.bright, 0.005, 0.08, true); break;
        case 'lead': this.tone(m, t, len, midiToHz(e.note), 'triangle', e.velocity * 0.5, 2600, 0.02, 0.15, true, 0, 5); break;
        case 'kick': this.kick(m, t, e.velocity); break;
        case 'snare': this.snare(m, t, e.velocity); break;
        case 'hat': this.hat(m, t, e.velocity); break;
      }
    }
  }

  private tone(m: MusicState, t: number, len: number, hz: number, type: OscillatorType, vel: number, cutoff: number, attack: number, release: number, send: boolean, detune = 0, vibrato = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    if (detune) osc.detune.value = detune;
    if (vibrato) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
      const lg = ctx.createGain(); lg.gain.value = vibrato;
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + len + release);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + attack);
    g.gain.setValueAtTime(vel, Math.max(t + attack, t + len - release * 0.5));
    g.gain.linearRampToValueAtTime(0, t + len + release);
    osc.connect(filter); filter.connect(g); g.connect(m.gain);
    if (send) g.connect(this.delay);
    osc.start(t);
    osc.stop(t + len + release + 0.02);
    m.live.add(osc);
    osc.onended = () => m.live.delete(osc);
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    this.noise = buf;
    return buf;
  }

  private kick(m: MusicState, t: number, vel: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g); g.connect(m.gain);
    osc.start(t); osc.stop(t + 0.3);
    m.live.add(osc); osc.onended = () => m.live.delete(osc);
  }

  private snare(m: MusicState, t: number, vel: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(m.gain);
    src.start(t); src.stop(t + 0.18);
    const body = ctx.createOscillator(); body.type = 'triangle'; body.frequency.setValueAtTime(190, t); body.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const bg = ctx.createGain(); bg.gain.setValueAtTime(vel * 0.35, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    body.connect(bg); bg.connect(m.gain); body.start(t); body.stop(t + 0.12);
    m.live.add(src); src.onended = () => m.live.delete(src);
  }

  private hat(m: MusicState, t: number, vel: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(m.gain);
    src.start(t); src.stop(t + 0.06);
    m.live.add(src); src.onended = () => m.live.delete(src);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.music) this.fadeOutMusic(this.music, 0.2);
    this.music = null;
    this.stopTrack();
  }
}

/** Linear volume fade on a Phaser sound over `ms`, then `done`. Plain timers: the game's tween manager is per scene. */
function fadeSound(sound: Phaser.Sound.BaseSound, to: number, ms: number, done?: () => void): void {
  const s = sound as Phaser.Sound.BaseSound & { volume: number; setVolume(v: number): unknown };
  const from = s.volume;
  const start = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / ms);
    try { s.setVolume(from + (to - from) * k); } catch { return; }
    if (k < 1) setTimeout(step, 33);
    else done?.();
  };
  step();
}
