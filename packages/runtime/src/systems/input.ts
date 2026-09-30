import Phaser from 'phaser';
import type { Direction } from '@beze/project-schema';

export { directionFromVector } from './joystick.js';

/**
 * One input state shared by every scene, stored in the game registry under 'input'. Keyboard keys and the on-screen
 * controls both feed it: held flags for movement and sprint, and edge-triggered `press` events for buttons, so the
 * world and the overlays read one path whatever the device.
 */
export type Button = 'interact' | 'attack' | 'ability' | 'map' | 'inventory' | 'pause' | 'up' | 'down' | 'left' | 'right';

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
}

export const PRESS_EVENT = 'press';

export class VirtualInput extends Phaser.Events.EventEmitter {
  /** Held by the on-screen controls (joystick direction, sprint and attack buttons). */
  readonly held: MoveInput & { attack: boolean } = { up: false, down: false, left: false, right: false, run: false, attack: false };
  private direction: Direction | null = null;

  /** Sets the joystick direction; a new non-null direction also counts as a press (menus navigate with it). */
  setDirection(dir: Direction | null): void {
    if (dir === this.direction) return;
    this.direction = dir;
    this.held.up = dir === 'up';
    this.held.down = dir === 'down';
    this.held.left = dir === 'left';
    this.held.right = dir === 'right';
    if (dir) this.press(dir);
  }

  press(button: Button): void {
    this.emit(PRESS_EVENT, button);
  }

  /** Subscribes to button presses; returns the unsubscribe function. */
  onPress(fn: (button: Button) => void): () => void {
    this.on(PRESS_EVENT, fn);
    return () => { this.off(PRESS_EVENT, fn); };
  }

  reset(): void {
    this.setDirection(null);
    this.held.run = false;
    this.held.attack = false;
  }
}

export function inputOf(scene: Phaser.Scene): VirtualInput {
  let input = scene.registry.get('input') as VirtualInput | undefined;
  if (!input) {
    input = new VirtualInput();
    scene.registry.set('input', input);
  }
  return input;
}

export interface MoveKeys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  /** Hold to run. Phaser maps both Shift keys to the one SHIFT key code. */
  run: Phaser.Input.Keyboard.Key[];
}

export function createMoveKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): MoveKeys {
  const K = Phaser.Input.Keyboard.KeyCodes;
  const add = (...codes: number[]) => codes.map((c) => keyboard.addKey(c));
  return { up: add(K.UP, K.W), down: add(K.DOWN, K.S), left: add(K.LEFT, K.A), right: add(K.RIGHT, K.D), run: add(K.SHIFT) };
}

const anyDown = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);

/** Keyboard and on-screen state merged into one movement reading. */
export function readMove(keys: MoveKeys, virtual: VirtualInput): MoveInput {
  const v = virtual.held;
  return {
    up: v.up || anyDown(keys.up),
    down: v.down || anyDown(keys.down),
    left: v.left || anyDown(keys.left),
    right: v.right || anyDown(keys.right),
    run: v.run || anyDown(keys.run),
  };
}

/** True when a touch screen is present; the on-screen controls are shown. */
export function hasTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}
