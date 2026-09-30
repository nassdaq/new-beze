import Phaser from 'phaser';
import { ctxOf, SCENE_KEYS } from '../context.js';
import { directionFromVector, inputOf, type Button, type VirtualInput } from '../systems/input.js';
import { UI } from '../ui/theme.js';

const STICK_RADIUS = 60;
const THUMB_RADIUS = 26;
const DEAD_ZONE = 14;
const IDLE_ALPHA = 0.55;
const ACTIVE_ALPHA = 0.9;

/**
 * On-screen controls for touch devices, drawn above everything: a floating joystick on the left (drag; the dominant
 * axis picks one of four directions, like the keyboard), E / Sprint / Attack (and the ability when the game has one)
 * on the right, and small M / I / pause buttons top-right. Everything feeds the shared `VirtualInput`.
 */
export class MobileControlsScene extends Phaser.Scene {
  private input$!: VirtualInput;
  private base!: Phaser.GameObjects.Arc;
  private thumb!: Phaser.GameObjects.Arc;
  private stickPointer: Phaser.Input.Pointer | null = null;
  private home = { x: 0, y: 0 };

  constructor() {
    super(SCENE_KEYS.mobile);
  }

  create(): void {
    const { width, height } = this.scale;
    this.input$ = inputOf(this);
    this.stickPointer = null;

    this.home = { x: 108, y: height - 108 };
    this.base = this.add.circle(this.home.x, this.home.y, STICK_RADIUS, 0x000000, 0.28).setStrokeStyle(3, 0xffffff, 0.5).setAlpha(IDLE_ALPHA);
    this.thumb = this.add.circle(this.home.x, this.home.y, THUMB_RADIUS, 0xffffff, 0.5).setStrokeStyle(2, 0xffffff, 0.9).setAlpha(IDLE_ALPHA);
    const zone = this.add.zone(0, 80, Math.round(width * 0.45), height - 80).setOrigin(0, 0).setInteractive();
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.stickPointer) return;
      this.stickPointer = pointer;
      const bx = Phaser.Math.Clamp(pointer.x, STICK_RADIUS + 12, zone.width - STICK_RADIUS);
      const by = Phaser.Math.Clamp(pointer.y, zone.y + STICK_RADIUS + 12, height - STICK_RADIUS - 12);
      this.base.setPosition(bx, by).setAlpha(ACTIVE_ALPHA);
      this.thumb.setPosition(bx, by).setAlpha(ACTIVE_ALPHA);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (pointer !== this.stickPointer) return;
      this.moveStick(pointer.x - this.base.x, pointer.y - this.base.y);
    });
    const release = (pointer: Phaser.Input.Pointer) => {
      if (pointer !== this.stickPointer) return;
      this.stickPointer = null;
      this.input$.setDirection(null);
      this.tweens.add({ targets: [this.base, this.thumb], x: this.home.x, y: this.home.y, alpha: IDLE_ALPHA, duration: 160, ease: 'Quad.easeOut' });
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.on(Phaser.Input.Events.GAME_OUT, () => { if (this.stickPointer) release(this.stickPointer); });

    this.button(width - 60, height - 88, 40, 'E', UI.accentInt, { press: 'interact' });
    this.button(width - 148, height - 52, 30, 'RUN', 0x6fc3ff, { hold: 'run' });
    this.button(width - 136, height - 140, 30, 'ATK', 0xff6b6b, { press: 'attack', hold: 'attack' });
    const { project } = ctxOf(this);
    const hasAbility = Object.values(project.scenes).some((s) => Object.values(s.entities).some((e) => e.components.some((c) => c.type === 'playerControl' && c.ability)));
    if (hasAbility) this.button(width - 52, height - 208, 30, 'WEB', 0xffffff, { press: 'ability' });
    this.button(width - 24, 64, 16, 'II', 0xffffff, { press: 'pause' });
    this.button(width - 64, 64, 16, 'I', 0xffffff, { press: 'inventory' });
    this.button(width - 104, 64, 16, 'M', 0xffffff, { press: 'map' });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input$.reset());
  }

  private moveStick(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.thumb.setPosition(this.base.x + dx * k, this.base.y + dy * k);
    this.input$.setDirection(directionFromVector(dx, dy, DEAD_ZONE));
  }

  /** A round button. `press` fires once on touch; `hold` keeps a held flag while the finger stays down. */
  private button(x: number, y: number, r: number, label: string, color: number, opts: { press?: Button; hold?: 'run' | 'attack' }): void {
    const shadow = this.add.circle(x, y + 2, r + 2, 0x000000, 0.35);
    const circle = this.add.circle(x, y, r, color, 0.28).setStrokeStyle(3, color, 0.9).setAlpha(IDLE_ALPHA);
    const text = this.add.text(x, y, label, { fontFamily: UI.font, fontSize: r >= 30 ? '20px' : '16px', fontStyle: '900', color: UI.text }).setOrigin(0.5).setAlpha(ACTIVE_ALPHA);
    circle.setInteractive(new Phaser.Geom.Circle(r, r, r + 12), Phaser.Geom.Circle.Contains);
    const down = () => {
      circle.setAlpha(ACTIVE_ALPHA).setScale(0.92);
      shadow.setScale(0.92);
      if (opts.hold) this.input$.held[opts.hold] = true;
      if (opts.press) this.input$.press(opts.press);
    };
    const up = () => {
      circle.setAlpha(IDLE_ALPHA).setScale(1);
      shadow.setScale(1);
      if (opts.hold) this.input$.held[opts.hold] = false;
    };
    circle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, down);
    circle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, up);
    circle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, up);
    text.setDepth(1);
  }
}
