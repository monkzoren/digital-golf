// Drag-to-putt aiming, shared by the game (main.ts) and the editor's test
// play (editor.ts). The pull is read in SCREEN space from where the pointer
// went down, mapped onto the ground through the camera axes captured at that
// moment — not by projecting the pointer onto the felt every frame. Projecting
// made the aim depend on the camera, and the camera followed the aim, so a
// perfectly still hand produced a drifting, juddering arrow.
import type { AimBasis } from './render3d';

/** Pointer travel before the pull counts — the first few pixels are noise. */
export const AIM_DEAD_PX = 10;

/** A pull this fraction of the canvas height is full power. */
const FULL_POWER_FRAC = 0.42;

export interface AimReading { angle: number; power: number }

/** Turn a pointer delta (CSS px, y down) into a shot: the ball flies away
 *  from the pull. Inside the dead zone the previous angle is kept. */
export function dragAim(dx: number, dy: number, basis: AimBasis, cssH: number, prevAngle: number): AimReading {
  const dist = Math.hypot(dx, dy);
  if (dist < AIM_DEAD_PX) return { angle: prevAngle, power: 0 };
  const span = Math.max(120, cssH * FULL_POWER_FRAC);
  const power = Math.max(0, Math.min(1, (dist - AIM_DEAD_PX) / span));
  // screen-right and screen-up on the ground, in golf-world units
  const px = basis.rx * dx - basis.fx * dy;
  const py = basis.ry * dx - basis.fy * dy;
  return { angle: Math.atan2(-py, -px), power };
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Ease a shown angle toward a target: takes the pixel jitter out of a
 *  short pull without adding lag you can feel (~50 ms). */
export function smoothAngle(shown: number, target: number, dt: number): number {
  return wrapAngle(shown + wrapAngle(target - shown) * (1 - Math.exp(-22 * dt)));
}

/** Keyboard aiming turns at a steady rate while a key is held. */
export const KB_TURN_RATE = 1.1; // rad/s (~63°/s)
export const KB_TURN_RATE_FINE = 0.25; // with Shift
