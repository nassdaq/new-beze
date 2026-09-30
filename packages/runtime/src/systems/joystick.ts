import type { Direction } from '@beze/project-schema';

/**
 * Joystick vector to one of four directions on the dominant axis, matching the keyboard's single-direction
 * movement. Inside the dead zone the stick is centred. Pure, so it is unit-tested in Node.
 */
export function directionFromVector(dx: number, dy: number, deadZone: number): Direction | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
