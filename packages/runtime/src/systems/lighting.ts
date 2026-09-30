import Phaser from 'phaser';
import type { Project, TileMap } from '@beze/project-schema';
import type { BuiltMap } from '../world/buildTilemap.js';
import { atmosphereAt, DEFAULT_LAMP_TAGS, isLampTag } from './atmosphere.js';

interface Lamp {
  light: Phaser.GameObjects.Light;
  base: number;
  night: boolean;
  flicker: boolean;
  seed: number;
}

/** Colour per lamp tag: street lamps warm white, food and pizza signs red, bank and news signs blue, the rest amber. */
function lampColor(tag: string): number {
  if (tag === 'lamp') return 0xffe0a8;
  if (tag.startsWith('sign_food') || tag.startsWith('sign_pizza')) return 0xff7a6a;
  if (tag.startsWith('sign_bank') || tag.startsWith('sign_news') || tag.startsWith('sign_bus')) return 0x7ab8ff;
  if (tag.startsWith('sign_park') || tag.startsWith('sign_market')) return 0x9de89a;
  if (tag === 'fountain') return 0x8fd3ff;
  return 0xffcc80;
}

/**
 * 2D lighting for the world scene: Phaser's Light2D pipeline on the tile layers and sprites, an ambient colour
 * that follows the day/night clock, lamps spawned from lit tiles (street lamps, signs) and from `light`
 * components, and a night-tinted overlay as the fallback on the Canvas renderer, where Light2D is unavailable.
 */
export class Lighting {
  readonly enabled: boolean;
  private lamps: Lamp[] = [];
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private lampTags: readonly string[];

  constructor(private scene: Phaser.Scene, project: Project, quality: 'high' | 'low' | 'auto') {
    const p = project.settings.presentation;
    const webgl = scene.sys.game.renderer.type === Phaser.WEBGL;
    this.enabled = webgl && quality !== 'low' && p?.lighting !== false;
    this.lampTags = p?.lampTags ?? DEFAULT_LAMP_TAGS;
    if (this.enabled) {
      scene.lights.enable().setAmbientColor(0xffffff);
    } else if (p?.lighting !== false && quality !== 'low') {
      const { width, height } = scene.scale;
      this.overlay = scene.add.rectangle(0, 0, width * 4, height * 4, 0x0b1030, 0).setOrigin(0.5).setScrollFactor(0).setDepth(19_000).setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.overlay.setPosition(width / 2, height / 2);
    }
  }

  /** Puts a tile layer or sprite under the light pipeline. */
  attach(obj: Phaser.GameObjects.GameObject | null | undefined): void {
    if (!this.enabled || !obj) return;
    (obj as unknown as { setPipeline(name: string): void }).setPipeline('Light2D');
  }

  attachMap(built: BuiltMap | null): void {
    if (!built) return;
    for (const layer of built.layers) this.attach(layer);
  }

  /** One lamp per lit tile (lamp posts, signs, kiosks) on any visible layer. Only shines at night. */
  addLampsFromMap(project: Project, map: TileMap): void {
    if (!this.enabled) return;
    const T = map.tileWidth;
    const refs = [...map.tilesets].sort((a, b) => b.firstGid - a.firstGid);
    for (const layer of map.layers) {
      if (!layer.visible) continue;
      for (let i = 0; i < layer.data.length; i++) {
        const gid = layer.data[i]!;
        if (gid === 0) continue;
        const ref = refs.find((r) => gid >= r.firstGid);
        const tileset = ref ? project.tilesets[ref.tilesetId] : undefined;
        if (!ref || !tileset) continue;
        const tag = tileset.tileProperties[String(gid - ref.firstGid)]?.tag;
        if (!isLampTag(tag, this.lampTags)) continue;
        const x = (i % map.width) * T + T / 2;
        const y = Math.floor(i / map.width) * T + (tag === 'lamp' ? T * 0.3 : T * 0.5);
        const strong = tag === 'lamp';
        this.add(x, y, strong ? 4.2 * T : 2.6 * T, lampColor(tag!), strong ? 1.15 : 0.8, true, tag!.startsWith('sign_'));
      }
    }
  }

  /** A light from a `light` component at the entity's centre. */
  add(x: number, y: number, radius: number, color: number, intensity: number, night: boolean, flicker: boolean): void {
    if (!this.enabled) return;
    const light = this.scene.lights.addLight(x, y, radius, color, night ? 0 : intensity);
    this.lamps.push({ light, base: intensity, night, flicker, seed: Math.random() * 100 });
  }

  /** Called every frame with the world clock's hour (null: no day/night cycle, plain daylight). */
  update(now: number, hour: number | null): void {
    const atmo = hour === null ? null : atmosphereAt(hour);
    const night = atmo?.night ?? 0;
    if (this.enabled) {
      this.scene.lights.setAmbientColor(atmo?.ambient ?? 0xffffff);
      for (const l of this.lamps) {
        let k = l.night ? night : 1;
        if (l.flicker && k > 0) k *= 0.8 + 0.2 * Math.sin(now / 70 + l.seed) * Math.sin(now / 190 + l.seed * 2);
        l.light.setIntensity(l.base * k);
      }
    } else if (this.overlay && atmo) {
      this.overlay.setFillStyle(atmo.sky, 1).setAlpha(night * 0.55 + (1 - night) * 0.0);
    }
  }

  /** How dark it is right now (0 day .. 1 night), for other systems (bloom strength, HUD icon). */
  static nightOf(hour: number | null): number {
    return hour === null ? 0 : atmosphereAt(hour).night;
  }
}
