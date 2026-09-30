import Phaser from 'phaser';
import type { Project, TileMap } from '@beze/project-schema';
import { KEYS } from '../context.js';
import { isGrass, type TagIndex } from '../world/tags.js';
import { CAR_H, CAR_W, carVariants, ensureBirdTextures, ensureCarTexture, ensurePuffTexture, ensureRainTexture } from '../world/vehicles.js';
import { findCells, findLanes, findWalks, type Lane, type Walk } from './lanes.js';
import type { Lighting } from './lighting.js';
import { atmosphereAt } from './atmosphere.js';

const CAR_SPEED = [62, 92] as const;
const CAR_SPACING_TILES = 13;
const CAR_STOP_AHEAD = 70;
const WALK_SPEED = [30, 44] as const;
const BIRD_EVERY_MS = [14_000, 30_000] as const;
const DEFAULT_STEAM_TAGS = ['roof_vent', 'alley_manhole', 'manhole'] as const;

interface Car {
  image: Phaser.Physics.Arcade.Image;
  lane: Lane;
  /** Position along the lane in px from the lane's start edge. */
  t: number;
  speed: number;
  v: number;
  light: Phaser.GameObjects.Light | null;
}

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  walk: Walk;
  characterId: string;
  t: number;
  dir: 1 | -1;
  speed: number;
  pauseUntil: number;
  frameH: number;
  colliderCX: number;
}

interface Bird {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  baseY: number;
  phase: number;
}

/**
 * Life in the world, derived from the map's tags: cars that drive the road lanes and stop for the player, citizens
 * pacing the sidewalks, birds crossing the sky, steam from vents and manholes, fireflies over grass at night, and
 * rain. Nothing here is saved or interactable; it is decoration that moves.
 */
export class Ambient {
  private cars: Car[] = [];
  private walkers: Walker[] = [];
  private birds: Bird[] = [];
  private nextBirdsAt = 0;
  private steam: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private fireflies: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private nextLightningAt = 0;
  private lightningShade: Phaser.GameObjects.Rectangle | null = null;
  private grassCells: Array<{ x: number; y: number }> = [];
  private birdKeys: [string, string] = ['', ''];
  private rand: () => number;
  private readonly T: number;
  readonly rainy: boolean;
  /** Bodies the player collides with (the cars). */
  readonly solids: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene, private project: Project, map: TileMap | null, index: TagIndex | null, private lighting: Lighting, private quality: 'high' | 'low' | 'auto', onLightning?: () => void) {
    const a = project.settings.ambient;
    this.T = project.settings.tileSize;
    this.rand = seeded(map ? map.width * 31 + map.height : 7);
    this.rainy = a?.weather === 'rain';
    this.onLightning = onLightning ?? null;
    if (map && index) {
      if (a?.traffic !== false) this.spawnTraffic(index);
      if (a?.pedestrians?.length) this.spawnWalkers(index, a.pedestrians);
      this.spawnSteam(index, a?.steamTags ?? DEFAULT_STEAM_TAGS);
      for (let i = 0; i < index.tags.length; i++) if (isGrass(index.tags[i]!)) this.grassCells.push({ x: i % index.width, y: Math.floor(i / index.width) });
    }
    if (a?.birds !== false) { this.birdKeys = ensureBirdTextures(scene); this.nextBirdsAt = scene.time.now + 4000 + this.rand() * 8000; }
    if (this.rainy) this.startRain();
  }

  private onLightning: (() => void) | null;

  // ------------------------------------------------------------------ traffic

  private spawnTraffic(index: TagIndex): void {
    const T = this.T;
    for (const lane of findLanes(index)) {
      const lengthPx = (lane.to - lane.from + 1) * T;
      const count = Math.max(1, Math.floor(lengthPx / (CAR_SPACING_TILES * T)));
      for (let i = 0; i < count; i++) {
        const variant = Math.floor(this.rand() * carVariants());
        const key = ensureCarTexture(this.scene, variant);
        const image = this.scene.physics.add.image(0, 0, key);
        image.setImmovable(true);
        if (lane.axis === 'h') { image.setFlipX(lane.dir < 0); image.body!.setSize(CAR_W - 4, CAR_H - 4); }
        else { image.setAngle(lane.dir > 0 ? 90 : -90); image.body!.setSize(CAR_H - 4, CAR_W - 4); }
        this.lighting.attach(image);
        const car: Car = { image, lane, t: ((i + 0.5) / count) * lengthPx + (this.rand() - 0.5) * T * 3, speed: CAR_SPEED[0] + this.rand() * (CAR_SPEED[1] - CAR_SPEED[0]), v: 0, light: null };
        car.v = car.speed;
        if (this.lighting.enabled && this.quality !== 'low') car.light = this.scene.lights.addLight(0, 0, T * 2.2, 0xfff0c0, 0);
        this.place(car);
        this.cars.push(car);
        this.solids.push(image);
      }
    }
  }

  private place(car: Car): void {
    const T = this.T;
    const along = car.lane.from * T + car.t;
    const across = car.lane.line * T + T / 2;
    if (car.lane.axis === 'h') car.image.setPosition(along, across);
    else car.image.setPosition(across, along);
    car.image.setDepth(car.image.y + 8);
    if (car.light) {
      const ahead = CAR_W * 0.7;
      car.light.setPosition(car.image.x + (car.lane.axis === 'h' ? car.lane.dir * ahead : 0), car.image.y + (car.lane.axis === 'v' ? car.lane.dir * ahead : 0));
    }
  }

  private updateTraffic(delta: number, player: Phaser.Physics.Arcade.Body | null, night: number): void {
    const T = this.T;
    for (const car of this.cars) {
      const lengthPx = (car.lane.to - car.lane.from + 1) * T;
      // Slow to a stop when the player stands in the lane just ahead.
      let target = car.speed;
      if (player) {
        const px = car.lane.axis === 'h' ? player.center.x : player.center.y;
        const py = car.lane.axis === 'h' ? player.center.y : player.center.x;
        const along = car.lane.from * T + car.t;
        const across = car.lane.line * T + T / 2;
        const aheadDist = (px - along) * car.lane.dir;
        if (Math.abs(py - across) < T * 0.9 && aheadDist > -CAR_W / 2 && aheadDist < CAR_STOP_AHEAD) target = 0;
        // Other cars ahead in the same lane keep their distance too.
        for (const other of this.cars) {
          if (other === car || other.lane !== car.lane) continue;
          const gap = (other.t - car.t) * car.lane.dir;
          if (gap > 0 && gap < CAR_W + 10) target = Math.min(target, other.v * 0.9);
        }
      }
      car.v += (target - car.v) * Math.min(1, delta / 250);
      car.t += car.lane.dir * car.v * (delta / 1000);
      if (car.t > lengthPx + CAR_W) car.t = -CAR_W;
      if (car.t < -CAR_W) car.t = lengthPx + CAR_W;
      // Fade at the lane ends so cars appear to come and go rather than pop.
      const edge = Math.min(car.t + CAR_W, lengthPx + CAR_W - car.t);
      car.image.setAlpha(Math.max(0, Math.min(1, edge / (T * 1.5))));
      this.place(car);
      car.light?.setIntensity(night * 0.9 * car.image.alpha);
    }
  }

  // ---------------------------------------------------------------- walkers

  private spawnWalkers(index: TagIndex, characterIds: string[]): void {
    const walks = findWalks(index).filter((w) => w.to - w.from >= 7);
    if (walks.length === 0) return;
    const count = Math.min(walks.length, Math.max(4, Math.min(10, Math.round(walks.length / 3))));
    const shuffled = [...walks].sort(() => this.rand() - 0.5);
    for (let i = 0; i < count; i++) {
      const walk = shuffled[i % shuffled.length]!;
      const characterId = characterIds[Math.floor(this.rand() * characterIds.length)]!;
      const character = this.project.characters[characterId];
      if (!character || !this.scene.textures.exists(KEYS.character(characterId))) continue;
      const sprite = this.scene.add.sprite(0, 0, KEYS.character(characterId), character.animations.idle_down.frames[0]).setOrigin(0, 1);
      this.lighting.attach(sprite);
      const w: Walker = {
        sprite, walk, characterId, t: this.rand() * (walk.to - walk.from) * this.T, dir: this.rand() < 0.5 ? 1 : -1,
        speed: WALK_SPEED[0] + this.rand() * (WALK_SPEED[1] - WALK_SPEED[0]), pauseUntil: 0, frameH: character.frameHeight,
        colliderCX: character.collider.offsetX + character.collider.width / 2,
      };
      this.placeWalker(w);
      this.walkers.push(w);
    }
  }

  private placeWalker(w: Walker): void {
    const T = this.T;
    const along = w.walk.from * T + w.t;
    const across = w.walk.line * T + T / 2;
    const x = w.walk.axis === 'h' ? along : across;
    const feetY = (w.walk.axis === 'h' ? across : along) + T / 2 - 2;
    w.sprite.setPosition(x - w.colliderCX, feetY);
    w.sprite.setDepth(w.sprite.y);
  }

  private updateWalkers(now: number, delta: number, player: Phaser.Physics.Arcade.Body | null): void {
    const T = this.T;
    for (const w of this.walkers) {
      const lengthPx = (w.walk.to - w.walk.from + 1) * T - T;
      const facing = w.walk.axis === 'h' ? (w.dir > 0 ? 'right' : 'left') : (w.dir > 0 ? 'down' : 'up');
      if (now < w.pauseUntil) {
        this.play(w, `idle_${facing}`);
        continue;
      }
      // Step aside for the player: pause when they stand right ahead.
      if (player) {
        const dx = player.center.x - (w.sprite.x + w.colliderCX);
        const dy = player.center.y - w.sprite.y;
        const aheadDist = w.walk.axis === 'h' ? dx * w.dir : dy * w.dir;
        const side = w.walk.axis === 'h' ? Math.abs(dy) : Math.abs(dx);
        if (aheadDist > 0 && aheadDist < T * 1.2 && side < T * 0.8) { this.play(w, `idle_${facing}`); continue; }
      }
      w.t += w.dir * w.speed * (delta / 1000);
      if (w.t >= lengthPx || w.t <= 0) {
        w.t = Math.max(0, Math.min(lengthPx, w.t));
        w.dir = (w.dir * -1) as 1 | -1;
        w.pauseUntil = now + 800 + this.rand() * 2200;
      } else if (this.rand() < 0.0015) {
        w.pauseUntil = now + 1000 + this.rand() * 2000;
      }
      this.play(w, `walk_${facing}`);
      this.placeWalker(w);
    }
  }

  private play(w: Walker, anim: string): void {
    const key = KEYS.animation(w.characterId, anim);
    if (w.sprite.anims.currentAnim?.key !== key && this.scene.anims.exists(key)) w.sprite.play(key, true);
  }

  // ------------------------------------------------------------------- birds

  private updateBirds(now: number, delta: number): void {
    if (this.birdKeys[0] && now >= this.nextBirdsAt) {
      this.nextBirdsAt = now + BIRD_EVERY_MS[0] + this.rand() * (BIRD_EVERY_MS[1] - BIRD_EVERY_MS[0]);
      const cam = this.scene.cameras.main;
      const view = cam.worldView;
      const dir = this.rand() < 0.5 ? 1 : -1;
      const count = 3 + Math.floor(this.rand() * 3);
      const baseY = view.y + view.height * (0.15 + this.rand() * 0.4);
      const startX = dir > 0 ? view.x - 40 : view.right + 40;
      for (let i = 0; i < count; i++) {
        const sprite = this.scene.add.image(startX - dir * i * 14, baseY + (i % 2) * 8 + i * 3, this.birdKeys[0]).setDepth(12_500).setFlipX(dir < 0).setAlpha(0.85);
        this.birds.push({ sprite, vx: dir * (80 + this.rand() * 30), baseY: sprite.y, phase: this.rand() * 10 });
      }
    }
    const cam = this.scene.cameras.main.worldView;
    for (const b of [...this.birds]) {
      b.sprite.x += b.vx * (delta / 1000);
      b.sprite.y = b.baseY + Math.sin(now / 260 + b.phase) * 2.5;
      b.sprite.setTexture(Math.floor(now / 110 + b.phase) % 2 === 0 ? this.birdKeys[0] : this.birdKeys[1]);
      if (b.sprite.x < cam.x - 80 || b.sprite.x > cam.right + 80) {
        b.sprite.destroy();
        this.birds = this.birds.filter((x) => x !== b);
      }
    }
  }

  // ------------------------------------------------------------------- steam

  private spawnSteam(index: TagIndex, tags: readonly string[]): void {
    const cells = findCells(index, tags);
    if (cells.length === 0) return;
    const key = ensurePuffTexture(this.scene);
    const T = this.T;
    for (const c of cells.slice(0, 14)) {
      const e = this.scene.add.particles(c.x * T + T / 2, c.y * T + T * 0.45, key, {
        frequency: this.quality === 'low' ? 700 : 320,
        lifespan: { min: 1200, max: 1900 },
        speedY: { min: -14, max: -26 },
        speedX: { min: -5, max: 5 },
        scale: { start: 0.35, end: 1.1 },
        alpha: { start: 0.32, end: 0 },
        quantity: 1,
      }).setDepth(c.y * T + T + 1);
      this.steam.push(e);
    }
  }

  // --------------------------------------------------------------- fireflies

  private updateFireflies(night: number): void {
    const enabled = this.project.settings.ambient?.fireflies !== false && this.quality !== 'low' && this.grassCells.length > 0 && !this.rainy;
    if (!enabled || night < 0.4) {
      if (this.fireflies) this.fireflies.stop();
      return;
    }
    if (!this.fireflies) {
      const key = ensurePuffTexture(this.scene);
      this.fireflies = this.scene.add.particles(0, 0, key, {
        frequency: 140,
        lifespan: { min: 2200, max: 3600 },
        speed: { min: 4, max: 14 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.12, end: 0.2 },
        alpha: { start: 0, end: 0 },
        tint: [0xd8ff7a, 0xfff3a0, 0xb8ff9a],
        blendMode: Phaser.BlendModes.ADD,
        quantity: 1,
        emitting: false,
      }).setDepth(9_000);
      // Twinkle: alpha rises then falls over the life.
      this.fireflies.ops.alpha.onUpdate = ((particle: Phaser.GameObjects.Particles.Particle, _key: string, t: number) => {
        const k = Math.sin(Math.PI * t);
        return 0.9 * k * k;
      }) as never;
    }
    const cam = this.scene.cameras.main.worldView;
    const T = this.T;
    const near = this.grassCells.filter((c) => c.x * T > cam.x - T && c.x * T < cam.right + T && c.y * T > cam.y - T && c.y * T < cam.bottom + T);
    if (near.length === 0) { this.fireflies.stop(); return; }
    if (!this.fireflies.emitting) this.fireflies.start();
    const c = near[Math.floor(this.rand() * near.length)]!;
    this.fireflies.setPosition(c.x * T + this.rand() * T, c.y * T + this.rand() * T);
  }

  // -------------------------------------------------------------------- rain

  private startRain(): void {
    const key = ensureRainTexture(this.scene);
    const { width, height } = this.scene.scale;
    const zoom = this.scene.cameras.main.zoom || 1;
    const vw = width / zoom; const vh = height / zoom;
    this.rain = this.scene.add.particles(0, 0, key, {
      x: { min: -vw * 0.3, max: vw * 1.3 },
      y: -30,
      frequency: this.quality === 'low' ? 40 : 12,
      lifespan: 900,
      speedY: { min: 420, max: 520 },
      speedX: { min: -70, max: -50 },
      scale: { start: 1, end: 1 },
      alpha: { start: 0.55, end: 0.2 },
      quantity: 1,
      rotate: 8,
    }).setDepth(18_000);
    // World-space objects moved to the camera's view every frame (screen-space objects would be zoomed about the centre).
    this.lightningShade = this.scene.add.rectangle(0, 0, vw * 3, vh * 3, 0xffffff, 0).setDepth(18_500);
    this.nextLightningAt = this.scene.time.now + 8000 + this.rand() * 12000;
  }

  private updateRain(now: number): void {
    if (!this.rain) return;
    const cam = this.scene.cameras.main;
    // Screen-space objects in a zoomed camera sit at the camera's visible origin.
    const ox = cam.worldView.x; const oy = cam.worldView.y;
    this.rain.setPosition(ox, oy);
    this.lightningShade?.setPosition(ox + cam.worldView.width / 2, oy + cam.worldView.height / 2);
    if (now >= this.nextLightningAt) {
      this.nextLightningAt = now + 12_000 + this.rand() * 20_000;
      const shade = this.lightningShade!;
      shade.setAlpha(0.75);
      this.scene.tweens.add({ targets: shade, alpha: 0, duration: 260, ease: 'Quad.easeOut' });
      this.scene.time.delayedCall(90, () => { shade.setAlpha(0.45); this.scene.tweens.add({ targets: shade, alpha: 0, duration: 400 }); });
      this.scene.time.delayedCall(900 + this.rand() * 1200, () => this.onLightning?.());
    }
  }

  // ------------------------------------------------------------------ update

  update(now: number, delta: number, player: Phaser.Physics.Arcade.Body | null, hour: number | null): void {
    const night = hour === null ? 0 : atmosphereAt(hour).night;
    this.updateTraffic(delta, player, night);
    this.updateWalkers(now, delta, player);
    this.updateBirds(now, delta);
    this.updateFireflies(night);
    this.updateRain(now);
  }

  dispose(): void {
    for (const c of this.cars) c.image.destroy();
    for (const w of this.walkers) w.sprite.destroy();
    for (const b of this.birds) b.sprite.destroy();
    for (const s of this.steam) s.destroy();
    this.fireflies?.destroy();
    this.rain?.destroy();
    this.lightningShade?.destroy();
    this.cars = []; this.walkers = []; this.birds = []; this.steam = [];
  }
}

function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
